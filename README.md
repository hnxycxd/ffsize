# ffsize

English · [简体中文](./README-zh_CN.md)

`ffsize` shows the size of each file and folder under a given path, sorted by size in descending order, and supports depth control.

## Usage

```bash
npx ffsize
```

You will see

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

You can also

```bash
# Show src directory
npx ffsize src

# Show src directory with 2 levels of depth
npx ffsize src -d 2

# Show all levels in the current directory
npx ffsize --all
# or
npx ffsize -a
```

Global installation

```bash
npm install -g ffsize
```

Use

```bash
ffsize src
```

## License

[MIT](LICENSE)
