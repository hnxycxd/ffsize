# dsize

[English](./README.md) · 中文

`dsize` 是一个轻量、高效的命令行工具，用于递归展示给定路径下每个文件和文件夹的大小，并按大小降序排列，帮助你快速找出占用磁盘空间的“大户”。

## 🌟 特性

- 🚀 **并行计算**：利用 Promise.all 并行读取文件和目录，极大提升计算速度。
- 📁 **层级展示**：支持以树状图的形式清晰展示目录结构。
- 📊 **自动单位**：根据文件大小自动在 `KB`、`MB`、`GB`、`TB` 之间切换单位。
- ⚙️ **深度控制**：支持通过 `-d` 参数限制展示深度，或使用 `--all` 展示完整树。

## 📖 使用方法

```bash
# 查看当前目录（默认展示 1 层深度）
npx dsize

# 查看指定目录
npx dsize /path/to/directory

# 指定展示深度（支持 1, 2, 3 层）
npx dsize -d 2
# 或者
npx dsize -d=3

# 展示所有层级的子文件和子文件夹
npx dsize --all
# 或者
npx dsize -a
```

### 💡 示例输出

```text
📂 path: /path/to/directory

name                                            size
-------------------------------------------------------
📁 node_modules                             25.62 MB
📁 .git                                     28.15 KB
📁 dist                                      9.64 KB
📁 src                                       8.66 KB
📄 package-lock.json                         2.31 KB
📄 package.json                              0.60 KB
📄 tsconfig.json                             0.38 KB
📄 .gitignore                                0.08 KB
-------------------------------------------------------
total                                       25.67 MB
```

## 📄 开源协议

[MIT](LICENSE)
