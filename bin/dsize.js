#!/usr/bin/env node

const fs = require('fs').promises
const path = require('path')

// 解析并获取命令行参数（路径，默认为当前目录，以及可选的深度 -d 参数或 --all 参数）
let targetPath = '.'
let maxDepth = 1 // 默认显示深度为 1 层

const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '-d') {
    const nextArg = args[i + 1]
    if (!nextArg) {
      console.error('❌ error: -d option requires a depth (1, 2, 3)')
      process.exit(1)
    }
    const depth = parseInt(nextArg, 10)
    if (isNaN(depth) || depth < 1 || depth > 3) {
      console.error('❌ error: -d depth must be 1, 2 or 3')
      process.exit(1)
    }
    maxDepth = depth
    i++ // 跳过数值参数
  } else if (arg.startsWith('-d=')) {
    const depthVal = arg.split('=')[1]
    const depth = parseInt(depthVal, 10)
    if (isNaN(depth) || depth < 1 || depth > 3) {
      console.error('❌ error: -d depth must be 1, 2 or 3')
      process.exit(1)
    }
    maxDepth = depth
  } else if (arg === '--all' || arg === '-a' || arg === '-all') {
    maxDepth = Infinity
  } else if (arg.startsWith('-')) {
    console.error(`❌ error: unknown option ${arg}`)
    process.exit(1)
  } else {
    // 非 - 开头的参数视为路径
    targetPath = arg
  }
}

const absolutePath = path.resolve(targetPath)

/**
 * 获取单个文件的大小（字节）
 */
async function getFileSize(filePath) {
  const stat = await fs.stat(filePath)
  return stat.size
}

/**
 * 递归获取文件夹总大小（字节）
 */
async function getFolderSize(folderPath) {
  let total = 0
  const entries = await fs.readdir(folderPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      total += await getFolderSize(fullPath)
    } else {
      const stat = await fs.stat(fullPath)
      total += stat.size
    }
  }
  return total
}

/**
 * 格式化字节大小，根据文件大小自动显示单位
 * 1. 低于 1MB，单位用 KB
 * 2. 在 1MB 跟 1GB 之间，单位用 MB
 * 3. 在 1GB 跟 1TB 之间，单位用 GB
 * 4. 再往上以此类推使用 TB
 */
function formatSize(bytes) {
  // 定义字节单位的基础大小（KILO = 1024 字节）
  const KILO = 1024
  const MEGA = KILO * 1024
  const GIGA = MEGA * 1024
  const TERA = GIGA * 1024

  // 低于 1MB，用 KB 显示
  if (bytes < MEGA) {
    return (bytes / KILO).toFixed(2) + ' KB'
  }
  // 在 1MB 跟 1GB 之间，用 MB 显示
  if (bytes < GIGA) {
    return (bytes / MEGA).toFixed(2) + ' MB'
  }
  // 在 1GB 跟 1TB 之间，用 GB 显示
  if (bytes < TERA) {
    return (bytes / GIGA).toFixed(2) + ' GB'
  }
  // 1TB 及以上，用 TB 显示
  return (bytes / TERA).toFixed(2) + ' TB'
}

/**
 * 递归构建目录树
 * 函数有三个参数，采用对象形式传递以满足规范
 */
async function buildTree({ itemPath, currentDepth, maxDepth }) {
  // 获取当前项的状态信息
  const stat = await fs.stat(itemPath)

  // 如果是文件，直接返回文件节点结构
  if (!stat.isDirectory()) {
    return {
      name: path.basename(itemPath),
      size: stat.size,
      isDirectory: false,
      children: [],
    }
  }

  // 如果是文件夹，但当前深度已经达到或超过了最大深度限制，则不再向下展示其子项，直接计算其总大小并返回空子节点
  if (currentDepth >= maxDepth) {
    const size = await getFolderSize(itemPath)
    return {
      name: path.basename(itemPath),
      size: size,
      isDirectory: true,
      children: [],
    }
  }

  // 如果未达到限制，则读取该目录下的直接子项并递归构建子树
  const entries = await fs.readdir(itemPath, { withFileTypes: true })

  // 并行处理当前文件夹下的所有子项
  const promises = entries.map(async (entry) => {
    const fullPath = path.join(itemPath, entry.name)
    return await buildTree({
      itemPath: fullPath,
      currentDepth: currentDepth + 1,
      maxDepth: maxDepth,
    })
  })

  // 等待并解析所有子项的属性树
  const resolvedChildren = await Promise.all(promises)

  // 对直接子项进行按大小从大到小降序排序
  resolvedChildren.sort((a, b) => b.size - a.size)

  // 计算当前目录的总大小为所有子项大小之和
  const totalSize = resolvedChildren.reduce((sum, child) => sum + child.size, 0)

  return {
    name: path.basename(itemPath),
    size: totalSize,
    isDirectory: true,
    children: resolvedChildren,
  }
}

/**
 * 递归打印树节点
 * 函数有两个参数，采用对象形式传递以满足规范
 */
function printTreeItem({ item, indentLevel }) {
  // 区分文件夹和文件前缀图标
  const typeMark = item.isDirectory ? '📁 ' : '📄 '

  // 根据深度层级在名字前加缩进，每一层级缩进 2 个空格
  const indent = ' '.repeat(indentLevel * 2)

  // 名字可用的最大显示字符长度（扣除缩进量，并保证不越界）
  const maxNameLength = Math.max(0, 36 - indentLevel * 2)

  // 对超长的文件名进行截断处理
  const truncatedName =
    item.name.length > maxNameLength
      ? item.name.slice(0, Math.max(0, maxNameLength - 3)) + '...'
      : item.name

  // 组合成带有缩进和图标的名称显示格式
  const nameDisplay = indent + typeMark + truncatedName

  // 格式化输出：名字栏左对齐占 40 字符，大小栏右对齐占 12 字符
  console.log(nameDisplay.padEnd(40) + formatSize(item.size).padStart(12))

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
async function main() {
  try {
    // 检查路径是否存在
    await fs.access(absolutePath)
    const stat = await fs.stat(absolutePath)

    let items = []
    if (stat.isDirectory()) {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true })
      // 并行计算并构建第一层直接子项及其层级子树（首层 currentDepth 传入 1）
      const promises = entries.map(async (entry) => {
        const fullPath = path.join(absolutePath, entry.name)
        return await buildTree({
          itemPath: fullPath,
          currentDepth: 1,
          maxDepth: maxDepth,
        })
      })
      items = await Promise.all(promises)
    } else {
      // 如果传入的是文件，只显示该文件的大小，无需子项树
      const size = await getFileSize(absolutePath)
      items = [{ name: path.basename(absolutePath), size: size, isDirectory: false, children: [] }]
    }

    // 将首层直接子项按大小降序排序（大的在前）
    items.sort((a, b) => b.size - a.size)

    // 输出表格
    console.log(`\n📂 path: ${absolutePath}\n`)
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
  } catch (err) {
    console.error(`❌ error: ${err.message}`)
    process.exit(1)
  }
}

main()
