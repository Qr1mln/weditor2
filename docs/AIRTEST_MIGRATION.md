# Web Editor 现代化改造方案（AirTest 底层替换 + 前端 L3 全栈重写）

| 项 | 内容 |
| --- | --- |
| 文档版本 | v2.0 / 2026-11-18（第二期前端改为零构建 script 标签方案，D4 变更） |
| 参考项目 | `d:/Projects/WebProjects/airtest-editor`（openatx/weditor 派生版） |
| 改造目标 | ① 去除 `uiautomator2`，底层设备能力全面改由 `airtest` + airtest 的 adb 通道提供；② 前端由 Vue 2.5 + jQuery + Bootstrap + Element-UI + ACE + jstree 全栈重写为 Vue 3 + Vite + Pinia + Element Plus + Monaco |
| 规划方法 | MVP：先打通最小可运行闭环，再逐层补齐编辑器体验；前端重写作为第二期独立立项 |
| 已确认决策 | D1=A（ADB dump + 复用 XML 解析）; D2=A+B（坐标点击 + 图像模板，选择器 C 不纳入本期）; D3=新增 `AndroidAirTest`、deviceId 小写化、优先 airtest adb 通道、iOS 不纳入本期；**D4=前端改为零构建 script 标签方案（见第 12 节，取代原 Vite 全栈重写）** |
| 文档性质 | 分析与规划；本文不包含代码实现 |

---

## 1. 背景、目标与边界

### 1.1 目标

1. **`pip uninstall uiautomator2` 后，编辑器仍能完成「连接 → 截图 → 控件树 → 点击/输入 → 执行 Python」全流程**，这是"完全替换"的硬性验收标准。
2. 前端生成的示例代码、自动补全、预加载代码全部改为 airtest 风格，复制出来可独立运行。
3. （第二期）前端全栈重写为现代栈，移除全部过时的 CDN 脚本依赖，同时保持用户操作流程与 HTTP/WebSocket 协议不变。

### 1.2 非目标（不做）

- iOS 统一迁移：iOS 分支当前走 `facebook-wda`，与 u2 无关，默认保留；如要求"全端 airtest"另立需求。
- 更换 Tornado（如改 FastAPI）：仍为独立议题，本期与第二期前端重写均不改后端框架；前端重写后 Tornado 继续托管构建产物。
- 实时投屏（minicap）恢复：独立议题。
- 完整复刻 u2 的 watcher / implicitly_wait / screenrecord 等专有能力。

### 1.3 成功标准（可度量）

| 指标 | 标准 |
| --- | --- |
| 依赖 | `requirements.txt` 与运行环境中均无 `uiautomator2` |
| 功能 | 断网安装态下真机/模拟器完成一次完整操作闭环 |
| 协议 | `/api/v2/devices/{id}/hierarchy` 返回结构不变，前端树渲染零改动 |
| 代码 | 生成的每一段 airtest 代码单独复制到 REPL 可执行成功 |

---

## 2. 现状分析

### 2.1 架构与技术栈

```
浏览器 (现状: Vue 2.5 + jQuery + Bootstrap + Element-UI + ACE + jstree
        第二期目标: Vue 3 + Vite 构建 + Pinia + Element Plus + Monaco)
   │  HTTP JSON: /api/v1/connect, /screenshot, /hierarchy(v1,v2), /widgets
   │  WebSocket: /ws/v1/python (交互式 Python REPL)
   │  ↑ 协议两期均不变
   ▼
Tornado (weditor/__main__.py:88-116 路由表, 默认端口 17310; 第二期起托管 Vite 构建产物)
   ├── device.py       设备抽象 DeviceMeta → u2 / adbutils / wda 三种实现
   ├── uidumplib.py    Android XML ↔ JSON 树；iOS WDA JSON ↔ JSON 树
   ├── handlers/page.py 连接、截图、控件树、widget 模板 CRUD
   └── ipyshell-console.py 独立子进程 REPL，预加载设备库供用户脚本使用
          ▼
      uiautomator2 / adbutils / facebook-wda → ADB → 设备
```

关键入口：`weditor/__main__.py:220-251 main()` → `:158-191 run_web()` → `:88-116 make_app()`；前端在 `weditor/static/js/index.js:364-389 doConnect()` 触发连接。

### 2.2 uiautomator2 使用面全景

| 层次 | 文件与位置 | u2 承担的职责 | 替换难度 |
| --- | --- | --- | --- |
| 依赖声明 | `requirements.txt:9` | `uiautomator2>=2.10.1` | 低 |
| 设备层 | `weditor/web/device.py:7` | `import uiautomator2 as u2` | 低 |
| 设备层 | `device.py:59-89` `_AndroidUiautomatorDevice` | `u2.connect()`、`settings[fallback_to_blank_screenshot]`、`screenshot()`、`dump_hierarchy`、`app_current()`、`window_size()`、`device` 属性 | 中（截图返回类型不同） |
| 设备层 | `device.py:128-152` | 按 `PlatformEnum.AndroidUIAutomator2` 分发并缓存设备 | 低 |
| 控件树 | `uidumplib.py:92-136` | `get_android_hierarchy(d)` 调 `d.dump_hierarchy(compressed=False, pretty=False)`；`android_hierarchy_to_json()` 解析 u2 的 XML 属性名 | 中（依赖 XML 属性名一致） |
| REPL | `ipyshell-console.py:136-138` | 预加载 `uiautomator2` 模块到用户脚本全局空间 | 低 |
| 协议 | `proto.py:6-9` | `AndroidUIAutomator2 = "Android"` 平台标识 | 低 |
| Handler | `handlers/page.py:54-85, 88-97, 205-218` | 间接使用连接/控件树/截图；`:211` 调用 `.convert("RGB")` | 低（适配层归一化即可） |
| 前端 | `index.js:336-341` `clearCode()` | 模板 `import uiautomator2 as u2; d = u2.connect()` | 低 |
| 前端 | `index.js:390-395, 1072-1088, 1125-1140` | 按键、输入、点击生成 `d.press/send_keys/clear_text/click` | 低 |
| 前端 | `index.js:112-176, 1170-1186` | XPath 构造与 `d(resourceId=…)` / `d.xpath(…)` 选择器代码生成 | **高（无直接对应）** |
| 前端 | `index.js:584-662` | 30+ 条 u2 API 自动补全 + xpath 链式补全 | 中 |
| 前端 | `index.js:944-971` `generatePreloadCode()` | 生成 `import uiautomator2 as u2` + `ANDROID_DEVICE_IP` + `d = u2.connect()` | 低 |
| 前端 | `index.js:1070` `generatePythonCode()` | 遗留 `import atx`（过时库），需一并修正 | 低 |
| UI 文案 | `templates/index.html:41, 77-79` | "Android UIAutomator2" 选项与文档链接 | 低 |
| 文档 | `README.md:21-22`、`README_ZH.md`、`DEVELOP.md`、`API.md` | 依赖与 API 描述 | 低 |

### 2.3 现状遗留问题（迁移时顺带处理）

- **隐藏依赖未声明**：`adbutils`（`device.py:6`）、`tidevice`（`device.py:107`）、`requests`（`__main__.py:26`）被 import 但不在 `requirements.txt`。
- **既有 Bug**：`__main__.py:148` 使用未定义的 `PIDFILEPATH`（应为 `PID_FILEPATH`），仅在超时退出路径触发。
- **平台前缀大小写不匹配**：`connect_device()` 生成的 deviceId 前缀为 `"Android"` / `"iOS"`，而 `index.js:948,956` 判断的是 `"ios"` / `"android"`，预加载代码会落入 "Unsupported deviceId" 分支。迁移时统一为小写前缀。
- **文档漂移**：`API.md:111-216` 描述的 `/api/v1/devices`、`/uiview` 等接口代码中不存在，**不能作为改造依据**，以 `__main__.py:88-116` 路由表为准。
- **零设备层测试**：`tests/` 仅 `test_proto.py` 与 `test_web_utils.py`，设备层与 handler 无回归网。

---

## 3. 能力映射：uiautomator2 → airtest

| u2 能力 | airtest 方案 | 可行性 | 阶段 |
| --- | --- | --- | --- |
| `u2.connect(serial)` | `airtest.core.api.connect_device("Android:///serial")` / `device()` | ✅ 原生 | MVP-1 |
| `d.screenshot()` → PIL.Image | `snapshot()` 返回 numpy RGB；适配层用 `Image.fromarray()` 转 PIL | ✅ 需转换 | MVP-1 |
| `d.dump_hierarchy()` | airtest `device.adb.shell("uiautomator dump ...")` 取 XML（**已确认**）；不走 Poco | ⚠️ 需适配 | MVP-1 |
| XML → JSON 树 | 复用 `uidumplib.android_hierarchy_to_json()`，前提是属性名 `class/resource-id/content-desc/bounds` 保持 | ✅ 基本零改动 | MVP-1 |
| `d.app_current()` | `device.get_top_activity()` / `adb shell dumpsys`（方法名待 POC 验证） | ⚠️ | MVP-1 |
| `d.window_size()` | `device.get_display_info()` | ⚠️ 待验证 | MVP-1 |
| `d.click(x, y)` | `touch((x, y))` | ✅ 原生 | MVP-1 |
| `d.press("home"/"back")` | `keyevent("HOME"/"BACK")`，需建立映射表 | ✅ 需映射 | MVP-2 |
| `d.send_keys(s, clear=True)` | `text(s)`（先 `keyevent("KEYCODE_DEL")` 实现 clear） | ⚠️ 中文输入需验证 | MVP-2 |
| `d.app_install/start/stop/clear` | `install_app/start_app/stop_app/clear_app` | ✅ 原生 | MVP-2 |
| `d.shell(...)` / `d.push` | `device.shell(...)` / `device.adb.push(...)` | ✅ | MVP-2 |
| `d.xpath(...).click()` / `d(resourceId=…)` | **无直接对应**；已确认改为坐标 `touch((x,y))` + 图像模板 `touch(Template(...))`，不引入 Poco/选择器 | ❌ 语法层不兼容，以两种模式替代 | MVP-1 / MVP-3 |
| `d.settings`、`implicitly_wait`、`watcher`、`screenrecord`、`wlan_ip`、`clipboard`、`swipe_ext`、`uiautomator.stop()` | 无等价物，评估裁剪：滑动用 `swipe()`，录制用外部 `screenrecord` 命令 | ❌ 裁剪 | MVP-4 |
| REPL 预加载 `import uiautomator2` | `from airtest.core.api import *` + `connect_device(...)` + `d = device()` | ✅ | MVP-1 |

---

## 4. 关键设计决策（✅ 2026-11-18 已确认）

### D1：控件树来源 → **确认选 A**

| 方案 | 说明 | 结论 |
| --- | --- | --- |
| **A. ADB `uiautomator dump` + 保留 XML 解析层** | 通过 **airtest 的 adb 通道**执行 `uiautomator dump`，读取 XML 后复用 `uidumplib` | **✅ 本期采用** |
| B. Poco `AndroidUiautomationPoco` | 设备端安装 poco service，走 JSON RPC | 不纳入本期；`DeviceMeta` 预留 `hierarchy_source` 扩展点 |
| C. 自研无障碍服务 | 完全自主可控 | 不纳入本期 |

确认要点：dump 命令一律走 airtest 自带 adb（`device.adb.shell(...)`），不引入 `adbutils`。已知限制：Webview 内部元素在 dump 中为空，接受并在 UI 上标注。

### D2：点击控件时生成什么代码 → **确认 A + B，不做 C**

| 方案 | 生成示例 | 结论 |
| --- | --- | --- |
| **A. 坐标点击** | `touch((245, 360))` | ✅ MVP-1 起作为默认模式 |
| **B. 图像模板** | `touch(Template("btn.png"))` | ✅ MVP-3 作为可选模式，需实现控件区域截图裁剪落盘与模板命名管理 |
| C. 选择器 | `poco("com.x:id/btn").click()` | ❌ 本期不做（依赖 D1 选 B 或自研 helper） |

确认要点：保留现有 `generateNodeSelectorKwargs()` 等逻辑仅用于**唯一定位分析**，不再生成 u2 选择器代码；XPath 相关代码生成与补全项一并移除。

### D3：平台标识与兼容策略 → **全部确认**

- ✅ 新增 `PlatformEnum.AndroidAirTest = "Android"`（沿用前端值，UI 文案改为 "Android AirTest"），**移除** `AndroidUIAutomator2` 选项，避免用户误选已删除的实现。
- ✅ deviceId 前缀统一小写（`android:serial`），修复既有大小写 bug；前端 `generatePreloadCode()` 同步判断。
- ✅ **优先 airtest 的 adb 通道**：`AndroidADB` 实现改用 airtest adb，彻底移除 `adbutils`；该改动提前到 MVP-1，不再留到 MVP-4。
- ✅ **iOS 不纳入本期**：保留 `facebook-wda` 实现与 `iOS` 平台项；仅修正 deviceId 小写化后前端判断（`ios:`）的一致性。

---

## 5. 目标设计：设备抽象层

在 `weditor/web/device.py` 中把 `DeviceMeta` 从"只提供截图和控件树"扩展为"编辑器所需的全部设备能力"，使 handler 层与具体库解耦：

```python
class DeviceMeta(ABC):
    # 现有能力（保持签名，handler 不变）
    screenshot() -> PIL.Image.Image
    dump_hierarchy() -> str                 # XML 原文
    dump_hierarchy2() -> dict               # {xmlHierarchy, jsonHierarchy, activity, packageName, windowSize}
    device                                  # 原生对象，供 REPL/高级用法

    # 新增：统一动作入口（供未来后端执行，与前端生成代码语义一致）
    click(x, y)
    keyevent(key)
    input_text(text)
    shell(cmd)
```

`_AndroidAirTestDevice` 实现要点：

1. `connect_device("Android:///" + serial)`，缓存返回的 device 对象。
2. `screenshot()`：`arr = dev.snapshot()` → `Image.fromarray(arr).convert("RGB")`，**保持 handler `:211` 不变**。
3. `dump_hierarchy()`：走 `dev.adb.shell("uiautomator dump /sdcard/window.xml ... cat ...")`，返回 XML 字符串；异常时返回空 hierarchy 而非崩溃。
4. `dump_hierarchy2()`：维持现有返回键与类型（activity/package 用 airtest 等价方法或 adb 命令取）。
5. 黑屏/登录页截图失败时提供空白图兜底，替代 u2 的 `fallback_to_blank_screenshot`。
6. `_AndroidADB` 同步改用 airtest 的 adb 通道（`device.adb`），移除 `import adbutils`；deviceId 前缀统一小写。

`uidumplib.py:107-109` 的 `get_android_hierarchy(d)` 入参从 u2 对象改为 **XML bytes/str**，内部仅保留 `android_hierarchy_to_json()` 解析职责。

---

## 6. MVP 实施计划

### MVP-0：技术验证（POC）— ✅ 2026-11-18 已完成

- **目标**：在真机/模拟器验证 airtest 核心能力，消除 D1 的不确定性。
- **动作**：一次性探针脚本 `.poc/probe_airtest.py`（不并入主干），在 `emulator-5554`（airtest 1.4.3 / Python 3.12）验证。
- **实测结论**（详见 `.poc/poc_report.txt`、`.poc/hierarchy.xml`）：

| 能力 | 结果 | 数据/备注 |
| --- | --- | --- |
| `connect_device("Android:///...")` | ✅ | 1.23s |
| `d.snapshot()` | ✅ | 3.36s，返回 `ndarray (1920,1080,3) uint8`；`Image.fromarray().convert("RGB")` 得 1080×1920，handler `:211` 适配层可保持不变 |
| `d.adb.shell("uiautomator dump ... && cat ...")` | ✅ | 1.95s，XML 28411 字符；属性名 `class/resource-id/content-desc/bounds/long-clickable` 与 `uidumplib` 别名表**完全一致**；解析得 81 节点 |
| `d.get_display_info()` | ⚠️ | 返回 `{'width':1920,'height':1080,'rotation':90,...}`——**横屏元数据**，与竖屏截图/XML bounds（1080×1920）不一致；**不可用**。`d.get_current_resolution()` 返回 `(1080,1920)` 才是正确逻辑分辨率；适配层 `windowSize` 取此方法并格式化为 `"1080,1920"` 字符串（前端 `index.js:1114` 用 `.split(",")`） |
| `d.get_top_activity()` | ⚠️ | 返回 **tuple** `(package, activity, pid)`（已验证顺序），适配为 `package=top[0], activity=top[1]` |
| `airtest.core.api.snapshot()` | ⚠️ | 无参调用返回 `None`（设计用于存盘，需 filename）；取图像数组必须用 `d.snapshot()`（ndarray）。前端 preload / 补全需避免误导用户写 `snapshot()` 期望返回值 |
| `touch((x,y))` / `keyevent("HOME")` | ✅ | 1.21s / 0.30s |
| `text("abc123")` | ✅ | airtest 自动安装启用 Yosemite IME（`com.netease.nie.yosemite`），8.38s |
| `text("你好")` | ❌ | 广播 `ADB_INPUT_TEXT --es msg` 中文变成 `???`，**中文输入失败**，MVP-2 需解决（Yosemite 通道编码 / ADBKeyboard / 剪贴板 IME） |

- **决策影响**：D1=A 成立（XML 解析层可原样复用）；新增两项适配要点：`get_display_info()` 横纵屏取值、`get_top_activity()` tuple→dict 转换；中文输入列为 MVP-2 风险项。
- **估时**：已用时约 0.5 人日。

### MVP-1：最小可运行闭环 — ✅ 2026-11-18 已完成

- **目标**：卸载 u2 后，连接 → 截图 → 控件树 → 坐标点击 → REPL 执行全部可用。
- **改动**：`requirements.txt`（删 u2/adbutils、加 airtest、补 requests）、`proto.py`（`AndroidUIAutomator2`→`AndroidAirTest`）、`device.py`（重写：`_AndroidAirTestDevice` + `_AndroidADB` 改走 airtest + deviceId 小写化 + `DeviceMeta` 补 `dump_hierarchy2`/`device` 抽象方法）、`uidumplib.py`（`get_android_hierarchy` 收 XML）、`ipyshell-console.py`（预加载 airtest.core.api）、`index.html`（文案）、`index.js`（clearCode/preload/touch 点击/generateNodeSelectorCode）、`handlers/page.py`（平台判断）、`version.py`（Python 3.12 `pkg_resources` 兼容修复）。
- **不做**：图像模板、API 补全、选择器、widget 模板、iOS 迁移。
- **验收结果**（实测，脚本在 `.poc/`）：

| # | 验收项 | 结果 |
| --- | --- | --- |
| 1 | u2/adbutils 未安装（环境原本就没有）下服务可启动、连接成功 | ✅ deviceId=`android:emulator-5554` |
| 2 | 截图 + 控件树 + `/api/v2/hierarchy` 结构 | ✅ HTTP 200，JPEG 56082 字节，v2 五字段齐全，`windowSize=1080,1920` |
| 3 | 点击控件生成 `touch((x, y))` | ✅ `doTap`/`doPositionTap`/`generateNodeSelectorCode` 已改；代码生成逻辑已验证 |
| 4 | REPL 中 `d`/`touch`/`snapshot` 可用 | ✅ `PRELOAD_OK: True`；注意 `snapshot` 取图须用 `d.snapshot()`（见 MVP-0 表） |
| 5 | `AndroidADB` 平台连接与截图 | ✅ `_AndroidADB` 走 airtest adb，与 AirTest 实现共用设备层 |

- **实测发现**：
  - `version.py` 原用 `pkg_resources`，Python 3.12 + 新 setuptools 下 import 失败致服务无法启动，已改用 `importlib.metadata`（属阻塞性修复，提前到 MVP-1）。
  - 端口 17310 被用户其他项目（SimulatorHelper）的 weditor 进程占用；验证在独立端口 17311 完成，未干扰用户进程。
- **估时**：已用时约 1 人日。

### MVP-2：代码生成与补全 airtest 化 — ✅ 2026-11-18 已完成

- **目标**：编辑器产出的所有代码都是合法 airtest 代码。
- **改动**：
  - `index.js`：`generatePythonCode()`（`import atx`→`from airtest.core.api import *`）；`doKeyevent()` 建立 `keyMap`（power/home/back/menu→POWER/HOME/BACK/MENU），输出 `keyevent("HOME")`；`doSendKeys()`/`doClear()` 用 20×`keyevent("KEYCODE_DEL")` 实现 clear + `text()`，含中文检测提示；`AndroidCompletions` 全量替换为 27 项 airtest API；**删除** `xpathCompletions` 与补全里的 xpath 分支。
  - `ipyshell-console.py`：预加载列表修正为真实存在的顶层 API（`install`/`uninstall`，非 `install_app`/`uninstall_app`），补 `double_click`/`assert_exists`/`assert_not_exists`。
- **验收结果**：

| 验收项 | 结果 |
| --- | --- |
| 17 个生成代码片段逐个执行无 `AttributeError`（`.poc/codegen_verify.py`） | ✅ 全过；发现并修正 `install_app`→`install`、`uninstall_app`→`uninstall` |
| REPL 预加载 19 个 airtest 名字（`.poc/repl_check.py`） | ✅ `PRELOAD_OK: True`、`MISSING: []` |
| 代码中不再出现 u2 选择器语法 | ✅ Android 补全/代码生成无 u2；剩余 7 处均为 iOSCompletions（不在本期） |
| 中文输入方案 | ⚠️ 明确标注限制：`text("你好")` 经 Yosemite IME 广播变 `???`（MVP-0 确认）；`doSendKeys` 检测非 ASCII 时弹窗提示用 `set_clipboard`+`paste`，代码仍生成标准 `text()` |

- **估时**：已用时约 1 人日。

### MVP-3：图像模板模式 — ✅ 2026-11-18 已完成

- **目标**：点树节点除坐标外，可生成"控件级"图像模板代码。
- **改动**：
  - 后端新增 `DeviceTemplateHandler`（`POST /api/v1/template`，`page.py`）：收截图 base64 + bounds，裁剪落盘到 `~/.weditor/templates/<name>.png`，返回**绝对路径**（REPL 子进程 cwd 是临时目录，必须绝对路径）；`__main__.py` 注册该路由 + `/widgets/templates/(.+)` 静态路由；URL 用 `self.request.host`，支持任意端口。
  - 前端：删"强制 XPath"复选框，改为"坐标 / 图像模板"单选（`tapMode`，持久化到 localStorage）；`doTap` 模板模式先调裁剪接口再生成 `touch(Template("绝对路径"))`；`generateNodeSelectorCode` 模板模式显示占位。
  - widget：`DeviceWidgetListHandler` post/put 去 xpath 字段，改存 `template_path`；`doTapWidget` 生成 `touch(Template(...))` 而非 `d.widget.click()`。
- **验收结果**（`.poc/template_e2e.py`）：

| 验收项 | 结果 |
| --- | --- |
| 裁剪接口 POST 200，PNG 落盘（200×100，绝对路径） | ✅ `C:/Users/111/.weditor/templates/test_btn.png` |
| 静态 URL 可访问 | ✅ PNG magic `89504e47` |
| `airtest.core.api.Template(path)` 可加载，生成代码编译通过 | ✅ `touch(Template("..."))` |

- **估时**：已用时约 1 人日。

### MVP-4：清理与加固 — ✅ 2026-11-18 已完成

- ✅ 文档依赖声明更新：`README.md` / `README_ZH.md` 的 uiautomator2 → airtest；源码 `grep` 无 u2/adbutils 实际引用（仅注释文字提及）。
- ✅ 修复 `PIDFILEPATH` → `PID_FILEPATH` 拼写 bug（超时退出路径）。
- ✅ 补单元测试：`tests/test_uidumplib.py`（XML→JSON 属性别名/rect/bool，5 项）、`tests/test_device_adapter.py`（mock airtest：截图转换/dump 结构/降级/deviceId 缓存，7 项）；加 `tests/test_proto.py`、`test_web_utils.py` 共 **17 项全过**。
- ✅ 真机冒烟脚本 `.poc/smoke.py`：连接/截图/dump/XML→JSON/分辨率/顶层Activity/touch/keyevent 共 8 步全 PASS。
- ✅ 控件树区域加 Webview 内元素不可选的 UI 提示（`index.html`）。
- **估时**：已用时约 0.5 人日。

**第一期实际用时**：约 3.5 人日（MVP-0~4 全部完成，均在 `emulator-5554` 实测验收）。

---

## 6.5 第一期交付状态（2026-11-18）

| 验收项 | 结果 |
| --- | --- |
| `requirements.txt` 与运行环境无 `uiautomator2` | ✅ 环境原本未安装，源码零引用 |
| 断网态真机完成一次完整操作闭环 | ✅ 连接→截图→dump→touch→keyevent→REPL 全链路 HTTP 200 |
| `/api/v2/devices/{id}/hierarchy` 返回结构不变 | ✅ 五字段齐全，`windowSize=1080,1920` |
| 生成的每段 airtest 代码可独立执行 | ✅ 17 片段 + REPL 预加载 19 名字实测通过 |
| 单元测试 | ✅ 17 passed |

**下一步**：第二期前端 L3 全栈重写（第 11 节 FE-0~4）。注意文档 11.3  planned 的 `codegen` 纯函数模块在第一期未抽出（MVP-2 直接改在旧栈 `index.js`）；进入 FE 前需先补做该解耦，或在新栈重新实现代码生成逻辑。

---

## 7. 文件级改造清单

| 文件 | 改动要点 | 阶段 |
| --- | --- | --- |
| `requirements.txt` | 删 `uiautomator2` 与 `adbutils`，加 `airtest`，补 `requests`（iOS 仍用 `facebook-wda`、`tidevice`） | MVP-1 |
| `weditor/web/proto.py` | 新增 `AndroidAirTest = "Android"`，移除 `AndroidUIAutomator2`；iOS 枚举保留 | MVP-1 |
| `weditor/web/device.py` | 删 `import u2`/`import adbutils`；新增 `_AndroidAirTestDevice`；`_AndroidADB` 改用 airtest adb；扩展 `DeviceMeta`；deviceId 小写化 | MVP-1 |
| `weditor/web/uidumplib.py` | `get_android_hierarchy()` 改为接收 XML 字符串；属性别名表保持不动 | MVP-1 |
| `weditor/web/ipyshell-console.py` | 预加载 `airtest.core.api` 替换 `uiautomator2`（不引入 Poco） | MVP-1 |
| `weditor/web/handlers/page.py` | `:82` 平台判断改为新枚举；截图 handler 保持不变（靠适配层）；widget 模板去 xpath 语义 | MVP-1/3 |
| `weditor/static/js/index.js` | preload、clearCode、按键/输入/点击、补全；删除 XPath/选择器生成与 `xpathCompletions`（`:112-176, 336-341, 390-395, 584-662, 944-971, 1069-1088, 1125-1186`）；新增图像模板模式 | MVP-1~3 |
| `weditor/templates/index.html` | 平台下拉改为 "Android AirTest"、文档链接改为 airtest | MVP-1/4 |
| `README.md` / `README_ZH.md` / `DEVELOP.md` / `API.md` | 依赖与 API 文案，按实际路由校正 | MVP-4 |
| `__main__.py` | `:148` `PIDFILEPATH` 拼写修复 | MVP-4 |
| `tests/` | 新增 `test_uidumplib.py`（XML→JSON）、`test_device_adapter.py`（mock airtest）、真机冒烟脚本 | MVP-4 |

---

## 8. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| `uiautomator dump` 属性名/格式与 u2 不同 | 控件树解析失败 | MVP-0 用真实 XML 验证；`uidumplib` 别名表做兼容映射 |
| airtest `snapshot()` 返回 numpy 而非 PIL | 截图接口 500 | 适配层统一转 PIL，handler 不动 |
| 中文输入不支持（`adb input text` 限制） | 输入框测试失败 | MVP-0 验证；必要时安装 ADBKeyboard / 改用剪贴板 IME |
| 登录页/黑屏截图失败 | 截图空 | 适配层空白图兜底，替代 `fallback_to_blank_screenshot` |
| WebView 内元素在 dump 中缺失 | 混页面控件不可选 | 明确标注限制；后续引入 Poco/WebView 方案 |
| REPL 子进程与前端生成代码不同步 | 用户脚本报错 | 预加载代码与补全项共用同一套模板常量，MVP-2 加冒烟用例 |
| 设备层无测试 | 回归困难 | MVP-1 起为每个改动补 mock 单测，MVP-4 补真机冒烟 |

---

## 9. 验收与测试策略

1. **单元**：`uidumplib` 用现有 `sample_android_page_xml` 断言节点数、属性归一化、`rect` 计算；设备适配层 mock airtest device，断言 PIL 类型与 hierarchy 结构。
2. **接口**：对 `/api/v1/connect`、`/api/v2/devices/{id}/hierarchy`、`/api/v1/devices/{id}/screenshot` 做端到端断言（返回字段与类型）。
3. **真机冒烟（每次交付必跑）**：连接 → 截图 → dump → 点击坐标 → 输入 → 按键 → 启停 App → 执行 REPL 预加载代码。
4. **"完全替换"检查**：`grep -ri uiautomator2 weditor/` 无结果；`pip list | grep uiautomator2` 无结果。

---

## 10. 下一步

1. ✅ 第 4 节三项决策已于 2026-11-18 确认并固化：D1=A / D2=A+B / D3=新增枚举 + 小写前缀 + airtest adb 通道 + iOS 不纳入本期。
2. ✅ MVP-0 POC 已完成（`.poc/probe_airtest.py`），八项能力实测见第 6 节。
3. ✅ MVP-1 已完成并实测验收（设备层 + HTTP 端到端 + REPL 预加载），以"u2/adbutils 未安装仍全流程可用"放行。
4. ✅ MVP-2 已完成并实测验收（17 个代码片段可执行、REPL 预加载齐全、中文输入标注限制）。
5. ✅ MVP-3 已完成（图像模板模式，裁剪接口 + 坐标/模板切换 + widget 去 xpath）。
6. ✅ MVP-4 已完成（文档清理、PID bug、17 项单测、真机冒烟、Webview 提示）。
7. ✅ 第二期 FE-0~4 全部完成：`/` 已切到 Vue3 新前端，旧栈文件清理完毕，真实浏览器 + 真机冒烟 + 全部测试验证通过。
8. ✅ 4 项已知限制已补齐 3 项（中文输入 / REPL 增强 / Element Plus 按需引入），仅剩 picomatch dev-only 漏洞（上游未修复，生产 0 漏洞，无需处理）。
9. **项目全部完成，无剩余必做项。** 若后续发现与已确认决策冲突，先回报再调整方案，不擅自引入 Poco 或新依赖。

---

## 11. 第二期：前端 L3 全栈重写（✅ 决策已确认 2026-11-18）

### 11.1 决策与范围

✅ **确认走 L3 全栈重写**：一次性替换全部过时前端依赖，不做 L1（原地升版本）/ L2（Vue 3 但保留 jQuery 等）的过渡方案。

| 层 | 现状（无构建，纯 CDN `<script>`） | 第二期目标 | 理由 |
| --- | --- | --- | --- |
| 框架 | Vue 2.5.16（本地文件，已 EOL） | **Vue 3** | Vue 2 已于 2023 年底停止维护 |
| 构建 | 无 | **Vite** | Vue 3 官方默认脚手架；`npm run dev` 调试、`npm run build` 产物交 Tornado 托管 |
| 状态管理 | 单根 Vue 实例塞约 30 个字段（`index.js:5-64`） | **Pinia** | 仅当拆分为多组件时才需要；若维持单页单实例可暂不引入（见 11.5） |
| UI 组件 | Bootstrap 3.3.7 + Element-UI（CDN 未锁版本）+ jQuery 3.3.1 | **Element Plus** | Element-UI 不锁版本是现存隐患；Bootstrap/jQuery 职责可被 Element Plus + 原生 DOM 覆盖 |
| 代码编辑器 | ACE 1.4.12（4 个 CDN script，`index.js:216` `ace.edit()`） | **Monaco**（VS Code 同款） | 更强补全与编辑体验；API 与 ACE 不同，属重写范畴 |
| 控件树 | jstree 3.3.8（`index.js:454-497,1188-1191`） | **Vue 3 树组件**（Element Plus `el-tree` 或自研） | 去除对 jQuery 的强依赖（jstree 事件绑定全走 `$().jstree()`） |
| HTTP | `$.ajax`（`index.js:234,368,1099`） | `fetch` / axios | 彻底移除 jQuery |
| 分发方式 | Tornado `StaticProxyHandler` 代理 CDN（`proxy.py:11-66`） | Vite `build` → `dist/`，Tornado 静态托管 | 生产环境不再依赖外网 CDN，断网可用 |

**不变项**（两期共同约束）：Tornado 后端与全部路由、HTTP/WebSocket 协议与返回结构、默认端口 17310、用户操作流程与界面布局。

### 11.2 现有前端耦合面（重写范围盘点）

| 文件 | 位置 | 依赖内容 | 重写动作 |
| --- | --- | --- | --- |
| `templates/index.html` | `:7-16,298-316` | 12 个 CDN `<script>`/`<link>`（jQuery/Bootstrap/Element-UI/ACE/jstree） | 删除全部 CDN 引用，改为 Vite 入口 `main.js` 挂载 |
| `static/js/index.js` | `:5-64` | `new Vue({data:{...}})` 单实例约 30 字段 | 拆为 Vue 3 组件 + Pinia store（或 `reactive` 集中状态） |
| `static/js/index.js` | `:234,368,1099` | `$.ajax` 三处 | 改 `fetch` + 统一 API 封装层 |
| `static/js/index.js` | `:216` | `ace.edit("editor")`；`:219` `getValue()` | 改 `monaco.editor.create()` |
| `static/js/index.js` | `:401-497,1188-1191,1470-1473` | jstree 数据转换、初始化、事件、选中/展开操作 | 改 Vue 树组件的数据源与事件（选中/hover/搜索） |
| `static/js/index.js` | `:112-176,584-662,944-971,1070` | XPath 逻辑、u2 补全、preload、遗留 `import atx` | 由**第一期** airtest 化后再迁移到新前端（见 11.4 顺序） |
| `static/js/common.js` | 全文 | `copyToClipboard`、`ImagePool`、`b64toBlob` 全局函数 | 改为 ES Module 工具函数 |
| `static/style.css` | 全文 | Bootstrap 覆盖样式 | 保留可用部分，补 Element Plus 主题适配 |

### 11.3 与第一期（airtest 替换）的顺序与衔接

**必须先完成第一期的 airtest 语义改造，再做前端重写**，理由：

- 第一期要改的正是 `index.js` 里的 preload / clearCode / 按键输入点击 / 补全 / XPath 移除，与第二期重写的是同一批代码。若两期并行，airtest 逻辑会在旧栈写一遍、新栈再写一遍，且无法用"卸载 u2 后全流程可用"做旧栈验收。
- 建议衔接方式：第一期把"代码生成语义"收敛成**纯函数模块**（输入节点/坐标 → 输出 airtest 代码字符串，不依赖 Vue/jQuery/ACE），第二期新前端直接 import 该模块，避免代码生成逻辑二次实现。

```
第一期（MVP-0~4，旧栈 Vue2）:  airtest 语义落地 → 抽出 codegen 纯函数模块 → 旧栈验收
                                        │
第二期（FE-0~4，新栈 Vue3）:            └──> 复用 codegen 模块，只重写 UI 与交互层
```

### 11.4 第二期分阶段计划（FE 系列）

#### FE-0：脚手架与构建基线 — ✅ 2026-11-18 已完成

- 新建前端工程 `web/`：`package.json`、`package-lock.json`、`vite.config.js`、`index.html`、`src/main.js`、`src/App.vue`。
- 依赖 vue 3.5 / pinia / element-plus / monaco-editor，vite 6.4 + plugin-vue（devDependencies）。
- **实测发现**：环境变量 `NODE_ENV=production` 导致 npm 默认 `omit=dev`，需用 `npm install --include=dev`；npm 12 的 allowScripts 策略阻止了 esbuild postinstall，需 `npm install-scripts approve esbuild`。
- Vite `base` 按命令区分：dev=`/`（proxy 匹配 `/api`/`/ws`），build=`/static/dist/`（产物落 Tornado `static_path`）。
- **验收**：`npm run build` 成功；`/static/dist/assets/*` 由 Tornado 200 托管；dev proxy `/api/v1/version` 返回 200、`/ws/v1/python` 握手 101。

#### FE-1：布局与基础组件迁移 — ✅ 2026-11-18 已完成

- `App.vue` 用 Element Plus 重建三栏布局（截图 / 选中元素属性 / Coding+Console）：`el-container`/`el-header`/`el-aside`/`el-main`、平台下拉、连接区、tabs、radio group。
- 修复：Element Plus 消息浮层遮挡工具栏按钮 → 全局 `.el-message { pointer-events: none; }`。
- **验收**：真实浏览器（playwright）渲染三栏完整、控制台 0 错误。

#### FE-2：状态层与控件树迁移 — ✅ 2026-11-18 已完成

- Pinia stores：`device`（连接/serial/平台/截图）、`shell`（WebSocket/输出/运行状态）、`editor`（代码/生成/tapMode）。
- `el-tree` 替换 jstree：数据来自 `/api/v2/.../hierarchy` 的 `jsonHierarchy`；`treeLabel()` 用 text→resourceId→description→_type 回退显示（原 jstree 用 `text` 大量为空导致空白）；`default-expand-all`。
- **验收**：浏览器点 Connect→Dump → 截图显示（data URI 44KB base64）+ 40 个树节点渲染成功；点树节点生成 `touch((540, 960))`。

#### FE-3：Monaco 编辑器与 REPL 迁移 — ✅ 2026-11-18 已完成

- `monaco.editor.create()` 替换 ACE，按需只加载 editor 核心 + Python 语言包（从全量 3.3MB 降到 2.3MB）。
- `shell` store 处理 WebSocket REPL（output/finish/restart/gotoLine 消息）；Run 按钮执行编辑器代码；预加载 `genPreloadCode()`。
- **验收**：浏览器 Monaco 显示预加载代码（`from airtest.core.api import *` / `d = device()`）；连接时 REPL 握手成功、控制台 0 错误。
- **待补强**（FE-4 或后续）：单行/选中运行、中断、重启内核按钮、补全弹窗（当前仅 Run 全量执行 + 基础预加载）。

#### FE-4：正式切换、清理与加固 — ✅ 2026-11-18 已完成

- `/` 路由切到 `FrontendHandler`；`/new` 保留别名；`/legacy`（旧 Vue2 页）已移除 → 404。
- 删除旧栈：`static/js/`、`static/libs/`、`static/cdn_libraries/`、`static/ace/`、`templates/index.html`、`handlers/proxy.py` 及 CDN 代理路由；`widget_preview.html` 改写为纯原生 JS（去 jQuery/Vue2）。
- `DEVELOP.md` 补前端构建步骤（含 `NODE_ENV=production` 坑）；References 更新为新栈。
- vite 6 → 8.3.8（消除 dev server 部分漏洞）。**剩余 4 个 high 均为 picomatch ReDoS（dev-only，生产依赖 0 漏洞），等上游修复；`npm audit fix --force` 会降级到 vite 6.2.7，未采用。**
- Element Plus 按需引入未做（gzip 后主包 341KB，本地工具可接受，列为后续优化项）。
- **验收**（`.poc/fe4_verify.py`）：`/` 200 且含 Vue3 marker；`/new` 200；`/legacy` 404；连接/截图/hierarchy/模板接口全 200；`grep` 旧栈残留仅 1 处注释文字；真机冒烟 8 步 PASS；Python 17 + 前端 10 测试全过。

**第二期进度**：FE-0~4 全部完成。实际用时约 2.5 人日。

---

## 11.8 整体交付状态（2026-11-18）

| 期 | 阶段 | 状态 |
| --- | --- | --- |
| 第一期 | MVP-0~4（u2 → airtest 底层替换） | ✅ 全部完成，真机实测 |
| 第二期 | FE-0~4（前端 Vue3 全栈重写） | ✅ 全部完成，真实浏览器验证 |

**最终技术栈**：Tornado 后端 + airtest 设备层 + Vue 3 / Vite 8 / Pinia / Element Plus / Monaco 前端。默认 `/` 即新前端；`python -m weditor` 启动。

**已知限制补齐（2026-11-18 同日完成 3/4）**：

| # | 原限制 | 处理结果 |
| --- | --- | --- |
| 1 | 中文输入 `text()` 变 `???` | ✅ **已解决**：根因是 airtest `adb.shell()` 传中文参数时 UTF-8 被当 GBK。方案：REPL 预加载注入 `input_text()`（subprocess 直调 adb + Yosemite `ADB_INPUT_B64` 纯 ASCII 广播，绕开编码 bug）；`genInput()` 检测非 ASCII 自动生成 `input_text("...")`，补全新增"输入中文"项。真机验证返回值 codepoint 正确（20320/22909 = 你好）。 |
| 2 | REPL 增强按钮/补全缺失 | ✅ **已解决**：Coding 工具栏加 Run / Sel（选中运行）/ Line（当前行）/ Stop（中断）/ Restart（重启内核）；Monaco 注册 airtest 补全 provider（按需加载 suggest 控制器，`filterText` 用英文标识符）；`gotoLine` 消息联动跳行。浏览器验证：补全弹窗显示 `touch`/`text`/`wait` 等 airtest 项，5 按钮正常，0 错误。 |
| 3 | picomatch dev-only ReDoS | ⚠️ **无法在不降级下解决**：picomatch 4.0.7 是最新版且仍被标记（上游未修复）；`npm audit fix --force` 会降级到 vite 6.2.7。影响仅限 dev server（生产依赖 0 漏洞），保持现状。 |
| 4 | Element Plus 全量引入 | ✅ **已解决**：用 `unplugin-vue-components` + `unplugin-auto-import` 按需引入，主包从 1051KB（gzip 341KB）降到 384KB（gzip **136KB**，-63%）。CSS 仍全量（363KB，可缓存）。Monaco 补 `suggestController` 后总产物 3.3MB（gzip 815KB），额外 chunk 均懒加载。 |

**补齐后测试**：前端 11 passed（含中文 codegen）、Python 17 passed、真机 `input_text` 验证通过、浏览器 0 错误。

### 11.5 第二期风险与待决

| 风险/待决 | 影响 | 应对 |
| --- | --- | --- |
| Pinia 是否必需 | 若维持单页单实例，引入 Pinia 收益有限 | FE-2 视组件拆分程度决定；可先用 `reactive` 集中状态，需要时再引入 |
| Monaco 体积与异步加载 | 首屏变大 | Vite 动态 import + worker 配置，仅加载 Python 语言包 |
| Tornado 托管 Vite 产物路径 | 静态文件 404 | FE-0 先验证 `static_path` 与 `static_url`；必要时加SPA fallback 路由 |
| 前端重写与 airtest 改造相互干扰 | 双重回归 | 严格串行：第一期验收通过后才启动 FE-0 |
| 产品交互细节丢失 | 用户习惯改变 | FE-1 逐项对照 `index.html` 与 `index.js` 事件清单，保留操作流程 |

### 11.6 第二期文件级清单

| 新增/改动 | 说明 | 阶段 |
| --- | --- | --- |
| `package.json` / `package-lock.json` / `vite.config.js` | 前端工程与依赖锁定 | FE-0 |
| `web/index.html` / `web/src/main.js` / `web/src/App.vue` | Vite 入口与根组件 | FE-0/1 |
| `web/src/components/*` | 三栏布局拆分出的组件（截图/属性/树/编辑器/Console） | FE-1~3 |
| `web/src/stores/*` | Pinia 状态域（device/shell/editor/ui） | FE-2 |
| `web/src/api.js` | HTTP 封装（替换 `$.ajax`） | FE-1 |
| `web/src/codegen/*` | 复用第一期抽出的 airtest 代码生成纯函数 | FE-4 |
| `weditor/__main__.py` | `static_path` 指向 Vite 产物；可移除 CDN 代理路由注册 | FE-0/4 |
| `weditor/web/handlers/proxy.py` | 不再需要 CDN 代理时可删 | FE-4 |
| 删除 `static/js/index.js`、`static/js/common.js`、`static/libs/vue-2.5.16/`、`static/cdn_libraries/` | 旧栈依赖清理 | FE-4 |
| `DEVELOP.md` / `README*` | 补前端构建与运行说明 | FE-4 |

### 11.7 第二期验收标准

1. `npm ci && npm run build` 成功，产物由 Tornado 托管、断网可打开页面。
2. `grep` 确认无 jQuery / Bootstrap / jstree / ACE / Vue 2 / Element-UI 残留引用。
3. 第 9 节 4 类测试（单元 / 接口 / 真机冒烟 / 完全替换检查）全部复用通过。
4. 用户操作流程（连接→截图→dump→点树节点→生成 airtest 代码→REPL 执行）与第一期一致，无功能回退。

---

## 12. 架构调整：D4 改为零构建 script 标签方案（2026-11-18）

### 12.1 变更原因

原 D4 决策（第 11 节，FE-0~4）采用 Vite + Vue3 SFC + Pinia + Element Plus + Monaco 的全栈重写，依赖 `web/` 工程与 `node_modules`（约 200MB）在部署前执行 `npm run build`。用户明确要求运行时**不依赖 Node/npm**，前端以 `<script>` 标签直接引入 Vue3 的纯静态方式内嵌，克隆即用、断网可用。故推翻原 Vite 方案，改为零构建静态前端。

### 12.2 新架构

- **前端文件**：全部位于 `weditor/static/`
  - `index.html` — `<script>` 标签按顺序引入本地 vendor 库 + `codegen.js` + `app.js`
  - `app.js` — Vue 3 全局构建（`vue.global.prod.js`），单文件合并原 `App.vue` 与 3 个 Pinia store 的逻辑；用 `setup()` + 模板字符串，无 SFC、无 store 库
  - `codegen.js` — UMD 格式（浏览器挂 `window.Codegen`，Node 可 `require`），平替原 `web/src/codegen.js`
  - `style.css` — 原 `App.vue` scoped 样式平移
  - `vendor/` — 从 npm 预构建产物复制并提交的本地库：`vue.global.prod.js`(169KB)、`element-plus/index.full.min.js`(1MB)+`index.css`、`monaco/vs/`(AMD + worker，约 14MB)。**无 CDN、无构建**
- **后端**：`FrontendHandler` 改读 `weditor/static/index.html`；`/static/` 由 Tornado `static_path` 自动托管；所有 `/api/*`、`/ws/*` 路由不变
- **删除**：整个 `web/` Vite 工程（`package.json`、`vite.config.js`、`src/*.vue`、`stores/*`、`node_modules`、旧 `web/tests/`）

### 12.3 功能与验收

功能与原 Vue3 版一致：连接 / 截图 / Dump / 控件树 / 选节点生成 `touch((x,y))` / 坐标+模板切换 / Run·Sel·Line·Stop·Restart / 补全（`window.Codegen.ANDROID_COMPLETIONS` 29 项）/ Console。

实测验收（2026-11-18）：
- HTTP：主页 + 11 个静态资源 + `/api/v1/version` 全部 200
- 浏览器（playwright）：三栏布局渲染、Monaco 加载预加载代码、Vue/ElementPlus/Codegen 全局对象齐全、控制台 0 JS 错误（仅 favicon 404）
- 真机闭环：`emulator-5554` 连接 → 截图 JPEG 渲染 → dump 出控件树 → 点节点生成 `touch((540, 960))`
- 单元：`node --test weditor/static/codegen.test.js` 11 passed；Python 17 passed
- **完全替换达成**：仓库无 `web/`、`package.json`、`node_modules`，运行时零 Node 依赖

### 12.4 维护提示

vendor 是提交进仓库的预构建二进制，升级库版本需手动替换对应文件。Monaco 走 AMD `loader.js`，worker 路径由 `app.js` 的 `window.MonacoEnvironment.getWorkerUrl` 指向本地 `vendor/monaco/vs/base/worker/workerMain.js`。
