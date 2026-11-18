## Doc for Developers
```bash
# clone
git clone https://github.com/openatx/weditor
pip install -e weditor
```

`-e`这个选项可以将weditor目录下的代码直接关联到python的`site-packages`中。


修改完后，直接运行`python -m weditor`调试

## 前端开发（Vue 3 / Vite）

默认页面由 `web/` 下的 Vue 3 前端构建产物提供（`weditor/static/dist/`）。

```bash
cd web
npm install --include=dev        # NODE_ENV=production 时需 --include=dev
npm install-scripts approve esbuild   # npm 12 allowScripts 策略下需要
npm run dev                      # 开发服务器 :5173，proxy /api /ws 到后端 :17310
npm run build                    # 构建产物 -> ../weditor/static/dist/
npm test                         # codegen 纯函数单元测试
```

后端仍用 `python -m weditor`（默认端口 17310）。前端 build 产物由 Tornado 静态托管，`/` 即新前端；`/new` 是别名。

> 环境变量 `NODE_ENV=production` 会让 npm 默认 `omit=dev`，导致 vite 未安装；务必用 `--include=dev`。

## 网页的基本布局（旧版 Vue2，仅供历史参考）
```
----------------------------
NAV
----------------------------
Screen | Properties | Tree
----------------------------
```

The following code is written in pug(rename from jade)

```pug
body
  nav
  #upper
    #left
      section#screen
      section#footer
      #horizon-gap
      #console
    #vertical-gap1
  #middle
    .panel
      .panel-body
      table
      input(type="text")
      pre.editor-container
  .vertical-gap
  #right
    .panel
      .panel-heading
    div(class=["input-group", "input-group-sm"])
      .input-group-btn
      input#jstree-search
      span.input-gropu-btn
    .box
      #jstree-hierarchy

```


See example: https://codepen.io/codeskyblue/pen/mYdjGb

## 发布到PYPI
目前先打`git tag`, push到github之后，再通过travis发布到pypi上

## References
- Vue 3: https://vuejs.org/
- Vite: https://vite.dev/
- Element Plus: https://element-plus.org/
- Monaco Editor: https://microsoft.github.io/monaco-editor/
- AirTest: https://airtest.doc.io.netease.com/

# LocalStorage
store keys:

- windowHierarchy: JSON.stringified data
- screenshotBase64
- code
