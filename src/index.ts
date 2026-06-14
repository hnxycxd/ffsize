#!/usr/bin/env node

import { readFileSync, promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

/**
 * 树节点接口，表示文件或文件夹的信息
 */
interface TreeItem {
  /** 节点名称 */
  name: string
  /** 节点大小（字节） */
  size: number
  /** 是否为文件夹 */
  isDirectory: boolean
  /** 子节点列表 */
  children: TreeItem[]
}

/**
 * 构建目录树的函数参数接口
 */
interface BuildTreeParams {
  /** 当前处理的路径 */
  itemPath: string
  /** 当前项的名称 */
  name: string
  /** 是否是文件夹 */
  isDirectory: boolean
  /** 当前递归深度 */
  currentDepth: number
  /** 最大递归深度限制 */
  maxDepth: number
}

/**
 * 打印树节点的函数参数接口
 */
interface PrintTreeItemParams {
  /** 待打印的树节点 */
  item: TreeItem
  /** 当前缩进层级 */
  indentLevel: number
}

/**
 * 从 package.json 中获取当前程序的版本号
 */
function getVersion(): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const packageJsonPath = path.resolve(__dirname, '../package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return packageJson.version || '0.0.0'
  }
  catch {
    // 如果读取失败，返回一个默认的备用版本号
    return '0.0.3'
  }
}

// 解析并获取命令行参数（路径，默认为当前目录，以及可选的深度 -d 参数或 --all 参数）
let targetPath: string = '.'
let maxDepth: number = 1 // 默认显示深度为 1 层

const args: string[] = process.argv.slice(2)

// 检查是否包含 -v 或 --version 参数，支持显示版本号
if (args.includes('-v') || args.includes('--version')) {
  console.log(`v${getVersion()}`)
  process.exit(0)
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-d') {
    const nextArg = args[i + 1]
    if (!nextArg) {
      console.error('❌ error: -d option requires a depth (1, 2, 3)')
      process.exit(1)
    }
    const depth = Number.parseInt(nextArg, 10)
    if (isNaN(depth) || depth < 1 || depth > 3) {
      console.error('❌ error: -d depth must be 1, 2 or 3')
      process.exit(1)
    }
    maxDepth = depth
    i++ // 跳过数值参数
  }
  else if (arg.startsWith('-d=')) {
    const depthVal = arg.split('=')[1]
    const depth = Number.parseInt(depthVal, 10)
    if (isNaN(depth) || depth < 1 || depth > 3) {
      console.error('❌ error: -d depth must be 1, 2 or 3')
      process.exit(1)
    }
    maxDepth = depth
  }
  else if (arg === '--all' || arg === '-a' || arg === '-all') {
    maxDepth = Infinity
  }
  else if (arg.startsWith('-')) {
    console.error(`❌ error: unknown option ${arg}`)
    process.exit(1)
  }
  else {
    // 非 - 开头的参数视为路径
    targetPath = arg
  }
}

const absolutePath: string = path.resolve(targetPath)

/**
 * 创建一个限制并发执行的 Promise 限制器
 * @param concurrency 最大并发数
 */
function pLimit(concurrency: number) {
  let activeCount = 0
  const queue: (() => void)[] = []

  const next = () => {
    activeCount--
    if (queue.length > 0) {
      const resolve = queue.shift()
      resolve?.()
    }
  }

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    activeCount++
    try {
      return await fn()
    }
    finally {
      next()
    }
  }
}

// 限制最大并发 I/O 操作数为 256，防止 EMFILE 错误并最大化利用 I/O 性能
const limit = pLimit(256)

/**
 * 判断是否为可跳过的文件系统错误（权限不足 / 文件不存在 / 断链等）
 * 这类错误不影响其他文件的正常扫描，应跳过而非终止程序
 */
function isSkippableFsError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: string }).code
    return code === 'EPERM' || code === 'EACCES' || code === 'ENOENT'
  }
  return false
}

/**
 * 递归并行获取文件夹总大小（字节），带并发控制
 */
async function getFolderSize(folderPath: string): Promise<number> {
  // 限制 readdir 的并发，权限不足时跳过该目录（返回 0）
  let entries: import('fs').Dirent[]
  try {
    entries = await limit(() => fs.readdir(folderPath, { withFileTypes: true }))
  } catch (err: unknown) {
    if (isSkippableFsError(err)) {
      return 0
    }
    throw err
  }

  const promises = entries.map(async (entry) => {
    const fullPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      // 跳过目录符号链接/junction，避免重复遍历浪费时间
      try {
        const lstats = await limit(() => fs.lstat(fullPath))
        if (lstats.isSymbolicLink()) {
          return 0
        }
      } catch (err: unknown) {
        if (isSkippableFsError(err)) {
          return 0
        }
        throw err
      }
      return getFolderSize(fullPath)
    }
    else {
      // 限制 stat 的并发，只对文件进行 stat
      try {
        const stat = await limit(() => fs.stat(fullPath))
        return stat.size
      } catch (err: unknown) {
        if (isSkippableFsError(err)) {
          return 0
        }
        throw err
      }
    }
  })

  const sizes = await Promise.all(promises)
  return sizes.reduce((sum, size) => sum + size, 0)
}

/**
 * 格式化字节大小，根据文件大小自动显示单位
 * 1. 低于 1MB，单位用 KB
 * 2. 在 1MB 跟 1GB 之间，单位用 MB
 * 3. 在 1GB 跟 1TB 之间，单位用 GB
 * 4. 再往上以此类推使用 TB
 */
function formatSize(bytes: number): string {
  // 定义字节单位的基础大小（KILO = 1024 字节）
  const KILO = 1024
  const MEGA = KILO * 1024
  const GIGA = MEGA * 1024
  const TERA = GIGA * 1024

  // 低于 1MB，用 KB 显示
  if (bytes < MEGA) {
    return `${(bytes / KILO).toFixed(2)} KB`
  }
  // 在 1MB 跟 1GB 之间，用 MB 显示
  if (bytes < GIGA) {
    return `${(bytes / MEGA).toFixed(2)} MB`
  }
  // 在 1GB 跟 1TB 之间，用 GB 显示
  if (bytes < TERA) {
    return `${(bytes / GIGA).toFixed(2)} GB`
  }
  // 1TB 及以上，用 TB 显示
  return `${(bytes / TERA).toFixed(2)} TB`
}

/**
 * 递归构建目录树，带并发控制，消除冗余 stat
 */
async function buildTree({
  itemPath,
  name,
  isDirectory,
  currentDepth,
  maxDepth,
}: BuildTreeParams): Promise<TreeItem> {
  // 如果是文件，直接获取大小并返回文件节点（权限不足时大小显示为 0）
  if (!isDirectory) {
    try {
      const stat = await limit(() => fs.stat(itemPath))
      return {
        name,
        size: stat.size,
        isDirectory: false,
        children: [],
      }
    } catch (err: unknown) {
      if (isSkippableFsError(err)) {
        console.error(`⚠️  warning: permission denied, stat '${itemPath}'`)
        return { name, size: 0, isDirectory: false, children: [] }
      }
      throw err
    }
  }

  // 如果是文件夹，但当前深度已经达到或超过了最大深度限制，则不再向下展示其子项，直接计算其总大小并返回空子节点
  if (currentDepth >= maxDepth) {
    const size = await getFolderSize(itemPath)
    return {
      name,
      size,
      isDirectory: true,
      children: [],
    }
  }

  // 如果未达到限制，则读取该目录下的直接子项并递归构建子树（权限不足时返回空目录，大小视为 0）
  let entries: import('fs').Dirent[]
  try {
    entries = await limit(() => fs.readdir(itemPath, { withFileTypes: true }))
  } catch (err: unknown) {
    if (isSkippableFsError(err)) {
      console.error(`⚠️  warning: permission denied, readdir '${itemPath}'`)
      return { name, size: 0, isDirectory: true, children: [] }
    }
    throw err
  }

  // 并行处理当前文件夹下的所有子项
  const promises = entries.map(async (entry) => {
    const fullPath = path.join(itemPath, entry.name)

    // 跳过目录符号链接/junction，避免重复遍历（只影响 maxDepth > 1 的深层模式）
    if (entry.isDirectory() && currentDepth < maxDepth) {
      try {
        const lstats = await limit(() => fs.lstat(fullPath))
        if (lstats.isSymbolicLink()) {
          // 不递归钻入，作为叶节点返回（仅显示，不计入重复大小）
          let size = 0
          try {
            const stats = await limit(() => fs.stat(fullPath))
            size = stats.size
          } catch (err: unknown) {
            if (!isSkippableFsError(err)) throw err
          }
          return { name: entry.name, size, isDirectory: true, children: [] }
        }
      } catch (err: unknown) {
        if (isSkippableFsError(err)) {
          return { name: entry.name, size: 0, isDirectory: true, children: [] }
        }
        throw err
      }
    }

    return buildTree({
      itemPath: fullPath,
      name: entry.name,
      isDirectory: entry.isDirectory(),
      currentDepth: currentDepth + 1,
      maxDepth,
    })
  })

  // 等待并解析所有子项的属性树
  const resolvedChildren = await Promise.all(promises)

  // 对直接子项进行按大小从大到小降序排序
  resolvedChildren.sort((a, b) => b.size - a.size)

  // 计算当前目录的总大小为所有子项大小之和
  const totalSize = resolvedChildren.reduce((sum, child) => sum + child.size, 0)

  return {
    name,
    size: totalSize,
    isDirectory: true,
    children: resolvedChildren,
  }
}

/**
 * 计算字符串在终端中的视觉显示宽度
 * 中文、日文、韩文等全角字符占 2 列，emoji 占 2 列，ASCII 占 1 列
 */
function displayWidth(s: string): number {
  let width = 0
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (
      (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
      (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) || // CJK
      (code >= 0xAC00 && code <= 0xD7A3) || // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
      (code >= 0xFE10 && code <= 0xFE19) || // Vertical forms
      (code >= 0xFE30 && code <= 0xFE6F) || // CJK Compatibility Forms
      (code >= 0xFF01 && code <= 0xFF60) || // Fullwidth Forms
      (code >= 0xFFE0 && code <= 0xFFE6) || // Fullwidth Signs
      (code >= 0x1F004 && code <= 0x1F9FF) || // Emoji
      (code >= 0x20000 && code <= 0x2FFFF) // CJK Extension B+
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * 将字符串填充到指定的终端视觉宽度
 */
function padEndVisual(s: string, targetWidth: number): string {
  const currentWidth = displayWidth(s)
  const padding = Math.max(0, targetWidth - currentWidth)
  return s + ' '.repeat(padding)
}

/**
 * 递归打印树节点
 * 函数有两个参数，采用对象形式传递以满足规范
 */
function printTreeItem({ item, indentLevel }: PrintTreeItemParams): void {
  // 区分文件夹和文件前缀图标
  const typeMark = item.isDirectory ? '📁 ' : '📄 '

  // 根据深度层级在名字前加缩进，每一层级缩进 2 个空格
  const indent = ' '.repeat(indentLevel * 2)

  // 名字可用的最大视觉宽度（扣除缩进和图标，并保证不越界）
  // typeMark（"📁 "/"📄 "）视觉宽度恒为 3（emoji 占 2 列 + 空格占 1 列）
  const maxNameWidth = Math.max(0, 40 - indentLevel * 2 - 3)

  // 对超长的文件名进行视觉宽度截断处理
  let truncatedName = item.name
  if (displayWidth(item.name) > maxNameWidth) {
    const ellipsis = '...'
    const ellipsisWidth = displayWidth(ellipsis)
    let w = 0
    let i = 0
    for (const ch of item.name) {
      const cw = displayWidth(ch)
      if (w + cw + ellipsisWidth > maxNameWidth) break
      w += cw
      i += ch.length
    }
    truncatedName = item.name.slice(0, i) + ellipsis
  }

  // 组合成带有缩进和图标的名称显示格式
  const nameDisplay = indent + typeMark + truncatedName

  // 格式化输出：名字栏左对齐占 40 视觉宽度，大小栏右对齐占 12 字符
  console.log(padEndVisual(nameDisplay, 40) + formatSize(item.size).padStart(12))

  // 如果包含被遍历并保存的子节点，按升序增加深度并递归打印
  if (item.children && item.children.length > 0) {
    for (const child of item.children) {
      printTreeItem({ item: child, indentLevel: indentLevel + 1 })
    }
  }
}

/**
 * 主函数：根据配置深度列出 targetPath 下的层级子项及大小
 */
async function main(): Promise<void> {
  // console.log(new Date().toLocaleString())
  try {
    // 检查路径是否存在
    const stat = await fs.stat(absolutePath)

    let items: TreeItem[] = []
    if (stat.isDirectory()) {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true })
      const totalCount = entries.length
      let completedCount = 0
      // console.log(`⏳ scanning... ${totalCount} items`)
      // 并行计算并构建第一层直接子项及其层级子树（首层 currentDepth 传入 1）
      const promises = entries.map(async (entry) => {
        const fullPath = path.join(absolutePath, entry.name)
        const result = await buildTree({
          itemPath: fullPath,
          name: entry.name,
          isDirectory: entry.isDirectory(),
          currentDepth: 1,
          maxDepth,
        })
        completedCount++
        process.stderr.write(`\rprogress: ${completedCount}/${totalCount}`)
        return result
      })
      items = await Promise.all(promises)
      process.stderr.write('\n')
    }
    else {
      // 如果传入的是文件，只显示该文件的大小，无需子项树
      items = [{ name: path.basename(absolutePath), size: stat.size, isDirectory: false, children: [] }]
    }

    // 将首层直接子项按大小降序排序（大的在前）
    items.sort((a, b) => b.size - a.size)

    // 输出表格
    console.log(`path: ${absolutePath}\n`)
    console.log('name'.padEnd(40) + 'size'.padStart(12))
    console.log('-'.repeat(55))

    // 递归打印每一项及其层级子节点（起始首层缩进层级为 0）
    for (const item of items) {
      printTreeItem({ item, indentLevel: 0 })
    }

    // 总计大小为首层直接子项大小之和
    const totalSize = items.reduce((sum, item) => sum + item.size, 0)
    console.log('-'.repeat(55))
    console.log('total'.padEnd(40) + formatSize(totalSize).padStart(12))
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ error: ${message}`)
    process.exit(1)
  }
}

main()
