## Doc for Developers
```bash
# clone
git clone https://github.com/openatx/weditor
pip install -e weditor
```

`-e`这个选项可以将weditor目录下的代码直接关联到python的`site-packages`中。


修改完后，直接运行`python -m weditor`调试

## 前端（Vue 3，零构建）

前端是纯静态文件，位于 `weditor/static/`，用 `<script>` 标签直接引入本地 vendor 库（Vue 3 / Element Plus / Monaco 的预构建版），**无需 Node、npm 或任何构建步骤**。克隆仓库后 `python -m weditor` 即可打开完整页面，断网可用。

文件结构：

```
weditor/static/
├── index.html                       # 主页面，script 标签引入下列资源
├── app.js                           # Vue 3 全局构建应用（原 App.vue + Pinia stores 合并）
├── codegen.js                       # airtest 代码生成（UMD：浏览器挂 window.Codegen，Node 可 require）
├── codegen.test.js                  # codegen 单元测试（node --test）
├── style.css                        # 页面样式
└── vendor/                          # 本地预构建依赖（已提交，随仓库分发）
    ├── vue.global.prod.js
    ├── element-plus/index.full.min.js + index.css
    └── monaco/vs/                   # AMD 版 + worker
```

后端 `python -m weditor`（默认端口 17310）通过 `FrontendHandler` 提供 `/`（`/new` 为别名），`/static/` 由 Tornado 静态托管。API 路由（`/api/v1/*`、`/api/v2/*`、`/ws/v1/python`）不变。

运行 codegen 单测：

```bash
node --test weditor/static/codegen.test.js
```

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
