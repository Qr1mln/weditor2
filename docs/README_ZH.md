# 该项目后面就不在更新了，请使用新的重构版 <https://uiauto.dev>

# WEditor
[![image](https://img.shields.io/pypi/v/weditor.svg?style=flat-square)](https://pypi.python.org/pypi/weditor)
[![image](https://img.shields.io/github/stars/alibaba/web-editor.svg?style=social&label=Star&style=flat-square)](https://github.com/alibaba/web-editor)
[![image](https://travis-ci.org/alibaba/web-editor.svg?branch=master)](https://travis-ci.org/alibaba/web-editor)

[English README.md](README.md)


编辑器能够提供辅助编写脚本，查看组件信息，调试代码等功能。

Screenshot

![screenshot](screenshot.jpg)

## 安装
依赖项目

- Python3.6+
  - [airtest](https://github.com/AirtestProject/Airtest) (Android)
  - [facebook-wda](https://github.com/openatx/facebook-wda) (iOS)


> Only tested in `Google Chrome`, _IE_ seems not working well.

```bash
pip3 install -U weditor # airtest, facebook-wda会被作为依赖一并安装上去
```

如果要运行开发版本，安装方法如下

```bash
git clone https://github.com/alibaba/web-editor
pip3 install -e web-editor
```

## 使用方法
```bash
python -m weditor2 --workspace D:\work\myproject
```

`--workspace` 指定文件操作根目录；省略时使用当前启动目录。点击“打开”会弹出页面内文件浏览器，在该目录中点选文件即可打开；“新建”在该目录下创建文件并打开；“保存”写回已打开的本地文件，不是下载副本。

创建桌面快捷方式（仅限Windows）

```bash
weditor --shortcut
```

快捷方式会以 `python -m weditor2` 启动。也可以直接运行：

```bash
python -m weditor2
```

这会启动本地 17310 端口的服务并打开浏览器。更多选项通过 `python -m weditor2 -h` 查看。

如果浏览器没有自动打开，可以手动访问 <http://localhost:17310>

> 17310这个端口是为了纪念，项目的创建日期 2017/03/10

旧的 `python -m server` 和 `python -m weditor` 命令仍然可用。

## 常用快捷键

**Mac**

- Command+Enter: 运行编辑器中所有代码
- Command+SHIFT+Enter: 运行选中代码或光标所在行代码

**Windows**

- CTRL+Enter: 运行编辑器中所有代码
- CTRL+SHIFT+Enter: 运行选中代码或光标所在行代码

## 开发者文档
See [DEVELOP.md](DEVELOP.md)

## LICENSE
[MIT](../LICENSE)
