# dsize

English · [简体中文](./README-zh_CN.md)

`dsize` is a lightweight, efficient CLI tool that recursively displays the size of each file and folder under a given path, sorted by size in descending order — helping you quickly identify disk space hogs.

## 🌟 Features

- 🚀 **Parallel computation** — Uses `Promise.all` to read files and directories in parallel, greatly speeding up calculation.
- 📁 **Hierarchical display** — Clearly presents directory structure in a tree-like table format.
- 📊 **Auto units** — Automatically switches between `KB`, `MB`, `GB`, and `TB` based on file size.
- ⚙️ **Depth control** — Limit display depth with the `-d` flag, or show the full tree with `--all`.

## 📖 Usage

```bash
# Scan the current directory (default: 1 level deep)
npx dsize

# Scan a specified directory
npx dsize /path/to/directory

# Specify display depth (supports 1, 2, 3)
npx dsize -d 2
# or
npx dsize -d=3

# Show all levels of sub-files and sub-folders
npx dsize --all
# or
npx dsize -a
```

### 💡 Example Output

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

## 📄 License

[MIT](LICENSE)
