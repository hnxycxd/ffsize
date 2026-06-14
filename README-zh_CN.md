# ffsize

[English](./README.md) · 中文

`ffsize` 用于展示给定路径下每个文件和文件夹的大小，并按大小降序排列，支持深度控制。

## 用法

```bash
npx ffsize
```

你会看到

```text
progress: 8/8
path: /path/to/directory

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

全局安装

```bash
npm install -g ffsize
```

你还可以

```bash
# 查看 src 目录
npx ffsize src

# 查看 src 目录下 2 层深度
npx ffsize src -d 2

# 查看当前目录下所有层级
npx ffsize --all
# 或者
npx ffsize -a
```

## License

[MIT](LICENSE)
