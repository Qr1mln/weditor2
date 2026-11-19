/* AirTest code generation - UMD (browser: window.Codegen, CommonJS: require).
 * Plain JS, no build step required. Semantics mirror the former web/src/codegen.js. */
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Codegen = api
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  function nodeCenter(node) {
    if (!node || !node.rect) return null
    return [
      Math.round(node.rect.x + node.rect.width / 2),
      Math.round(node.rect.y + node.rect.height / 2),
    ]
  }

  function genTouch(x, y) {
    return `touch((${x}, ${y}))`
  }

  function genTouchNode(node) {
    const c = nodeCenter(node)
    return c ? genTouch(c[0], c[1]) : ''
  }

  function genTemplateTap(path) {
    return `touch(Template("${path}"))`
  }

  const KEY_MAP = { power: 'POWER', home: 'HOME', back: 'BACK', menu: 'MENU' }

  function genKeyevent(meta) {
    return `keyevent("${KEY_MAP[meta] || String(meta).toUpperCase()}")`
  }

  function genIOSHome() {
    return 'd.home()'
  }

  function hasNonAscii(text) {
    return /[^\x00-\x7F]/.test(text)
  }

  function genInput(text, clearCount = 20) {
    const clears = Array(clearCount).fill('keyevent("KEYCODE_DEL")').join('\n')
    const typer = hasNonAscii(text) ? `input_text("${text}")` : `text("${text}")`
    return clears + '\n' + typer
  }

  function genClear(clearCount = 20) {
    return Array(clearCount).fill('keyevent("KEYCODE_DEL")').join('\n')
  }

  function connectLines(platform, deviceUrl) {
    const url = String(deviceUrl || '')
    if (platform === 'iOS' || platform === 'ios') {
      return [
        'from airtest.core.api import *',
        'import os',
        'import wda',
        '',
        `os.environ['DEVICE_URL'] = "${url}"`,
        'c = d = wda.Client()',
      ]
    }
    return [
      'from airtest.core.api import *',
      '',
      `connect_device("Android:///${url}")`,
      'd = device()',
    ]
  }

  function genClearCode(platform = 'Android', deviceUrl = '') {
    return [
      '# coding: utf-8',
      '',
      ...connectLines(platform, deviceUrl),
      '',
      'log("hello world")',
      '',
    ].join('\n')
  }

  function genPreloadCode(deviceId) {
    const m = /^([^:]+):(.*)/.exec(deviceId || '')
    if (!m) return 'print("Unsupported deviceId: ' + deviceId + '")'
    const prefix = m[1]
    const deviceUrl = m[2]
    const platform = prefix === 'ios' ? 'iOS'
      : prefix === 'androidadb' ? 'AndroidADB'
        : prefix === 'android' ? 'Android' : null
    if (!platform) return `print("Unsupported deviceId: ${deviceId}")`
    return [
      "log('Set environment and prepare airtest device')",
      ...connectLines(platform, deviceUrl),
    ].join('\n')
  }

  function genPythonCode(code) {
    return ['# coding: utf-8', 'from airtest.core.api import *', 'd = device()', code].join('\n')
  }

  function genSelectorDisplay(node, tapMode = 'coordinate') {
    if (tapMode === 'template') return 'touch(Template("..."))  // 点击节点生成模板'
    return genTouchNode(node)
  }

  const ANDROID_COMPLETIONS = [
    { name: '连接设备', value: 'connect_device("Android:///")' },
    { name: '当前设备', value: 'd = device()' },
    { name: '坐标点击', value: 'touch((x, y))' },
    { name: '图像模板点击', value: 'touch(Template("tpl.png"))' },
    { name: '双击', value: 'double_click((x, y))' },
    { name: '滑动', value: 'swipe((x1, y1), (x2, y2))' },
    { name: '输入文本', value: 'text("hello")' },
    { name: '输入中文', value: 'input_text("你好")' },
    { name: '按键 Home', value: 'keyevent("HOME")' },
    { name: '按键 Back', value: 'keyevent("BACK")' },
    { name: '等待', value: 'sleep(1)' },
    { name: '截图(存盘)', value: 'snapshot("screen.png")' },
    { name: '截图(数组)', value: 'img = d.snapshot()' },
    { name: '存在图像', value: 'exists(Template("tpl.png"))' },
    { name: '找全部', value: 'find_all(Template("tpl.png"))' },
    { name: '等待图像', value: 'wait(Template("tpl.png"), timeout=10)' },
    { name: '启动应用', value: 'start_app("com.package")' },
    { name: '停止应用', value: 'stop_app("com.package")' },
    { name: '清空应用', value: 'clear_app("com.package")' },
    { name: '安装应用', value: 'install("app.apk")' },
    { name: '卸载应用', value: 'uninstall("com.package")' },
    { name: '执行shell', value: 'd.shell("pwd")' },
    { name: '推送文件', value: 'd.adb.push("local", "remote")' },
    { name: '拉取文件', value: 'd.adb.pull("remote", "local")' },
    { name: '设置剪贴板', value: 'd.set_clipboard("text")' },
    { name: '获取剪贴板', value: 'd.get_clipboard()' },
    { name: '当前分辨率', value: 'd.get_current_resolution()' },
    { name: '顶层Activity', value: 'd.get_top_activity()' },
    { name: '图像识别日志', value: 'log("message")' },
  ]

  // 中文 API 提示：参考 airtest.core.api 官方文档翻译，用于编辑器补全悬浮说明
  const AIRTEST_API_DOCS = {
    'connect_device("Android:///")': [
      '**connect_device(uri)**',
      '通过 URI 连接设备，并将其设为当前设备。',
      '- `uri`（str）：设备连接串，格式为 `android://adbhost:adbport/serialno?参数=值`',
      '  - `"Android:///"`：本机 adb 设备（默认参数）',
      '  - `"Android:///SJE5T17B17"`：指定序列号的本机设备',
      '  - `"Android://127.0.0.1:5037/10.0.0.1:5555"`：远端设备',
      '返回：设备实例',
      '示例：`connect_device("Android:///SJE5T17B17")`',
    ].join('\n'),
    'd = device()': [
      '**device()**',
      '返回当前激活的设备实例。',
      '返回：当前设备实例',
      '示例：`d = device()` 之后可调用 `d.touch((100, 100))` 等设备方法',
    ].join('\n'),
    'touch((x, y))': [
      '**touch(v, times=1, **kwargs)**',
      '在设备屏幕上执行点击（触摸）动作。',
      '- `v`：点击目标，可为绝对坐标 `(x, y)`、相对坐标如 `(0.5, 0.5)`（屏幕中心），或 `Template` 图片对象',
      '- `times`（int）：点击次数，默认 1',
      '- `duration`（float，Android/Windows）：按住时长（秒）',
      '返回：最终点击的坐标，如 `(100, 100)`',
      '示例：`touch((100, 100))`、`touch((100, 100), times=2)`',
    ].join('\n'),
    'touch(Template("tpl.png"))': [
      '**touch(Template(...))**',
      '在屏幕上查找图片模板并点击其匹配位置（默认中心）。',
      '- `Template`：模板图片对象，可用 `target_pos` 指定点击模板上的相对位置（1~9，5 为中心）',
      '- `times`（int）：点击次数，默认 1',
      '返回：最终点击的坐标',
      '示例：`touch(Template("tpl.png"))`',
    ].join('\n'),
    'double_click((x, y))': [
      '**double_click(v)**',
      '在目标位置执行双击。',
      '- `v`：双击目标，可为坐标 `(x, y)` 或 `Template` 图片对象',
      '返回：点击坐标',
      '示例：`double_click((100, 100))`',
    ].join('\n'),
    'swipe((x1, y1), (x2, y2))': [
      '**swipe(v1, v2=None, vector=None, **kwargs)**',
      '在设备屏幕上执行滑动，可指定起止点或滑动向量。',
      '- `v1`（必填）：滑动起点，坐标 `(x, y)` 或 `Template`',
      '- `v2`：滑动终点，坐标或 `Template`',
      '- `vector`：滑动向量，可为绝对坐标或屏幕百分比，如 `(0.5, 0)`（向右滑半屏）',
      '- `duration`（float）：滑动时长（秒）；`steps`（int，Android/iOS）：滑动步数',
      '返回：起点与终点坐标',
      '示例：`swipe((100, 100), (200, 200), duration=0.5)`',
    ].join('\n'),
    'text("hello")': [
      '**text(text, enter=True, **kwargs)**',
      '向当前获得焦点的输入框输入文本，输入控件必须先处于激活状态。',
      '- `text`（str）：要输入的文本，支持 Unicode',
      '- `enter`（bool）：输入后是否按回车，默认 `True`',
      '- `search`（bool，Android）：输入后是否触发搜索',
      '返回：`None`',
      '示例：`text("test")`、`text("test", enter=False)`',
    ].join('\n'),
    'input_text("你好")': [
      '**input_text(text, enter=True)**',
      '向当前焦点输入文本（含中文）。Airtest 的 `text()` 通过内置输入法支持中文输入，本项即等价的中文输入方式。',
      '- `text`（str）：要输入的文本，如 `"你好"`',
      '- `enter`（bool）：输入后是否按回车，默认 `True`',
      '示例：`input_text("你好")`',
    ].join('\n'),
    'keyevent("HOME")': [
      '**keyevent(keyname, **kwargs)**',
      '向设备发送系统按键事件。Android 上等价于 `adb shell input keyevent KEYNAME`。',
      '- `keyname`（str）：按键名，如 `HOME`、`BACK`、`KEYCODE_DEL`，也可用数字键码如 `"3"`（等同 HOME）',
      '返回：`None`',
      '示例：`keyevent("HOME")`',
    ].join('\n'),
    'keyevent("BACK")': [
      '**keyevent("BACK")**',
      '发送返回键（Android 键码 4），返回上一级界面。',
      '- `keyname`（str）：`BACK`',
      '返回：`None`',
      '示例：`keyevent("BACK")`',
    ].join('\n'),
    'sleep(1)': [
      '**sleep(secs=1.0)**',
      '暂停脚本执行指定秒数，该操作会记录在报告中。',
      '- `secs`（float）：睡眠时长（秒），默认 1.0',
      '返回：`None`',
      '示例：`sleep(1)`',
    ].join('\n'),
    'snapshot("screen.png")': [
      '**snapshot(filename=None, msg="", quality=None, max_size=None)**',
      '截取目标设备屏幕并保存到文件，便于后续 Template 匹配或报告展示。',
      '- `filename`（str）：保存文件名，相对路径默认存到 `ST.LOG_DIR`',
      '- `msg`（str）：报告中的简短描述',
      '- `quality`（int，1~99）：图片质量；`max_size`（int）：图片最大尺寸',
      '返回：`{"screen": 文件名, "resolution": 分辨率}` 或 `None`',
      '示例：`snapshot(filename="test.png", msg="test")`',
    ].join('\n'),
    'img = d.snapshot()': [
      '**d.snapshot()**（设备方法）',
      '获取当前设备屏幕截图（内存中的图像数据，不写入文件），可用于自定义图像识别。',
      '返回：截图图像数据',
      '示例：`img = d.snapshot()`',
    ].join('\n'),
    'exists(Template("tpl.png"))': [
      '**exists(v)**',
      '检查目标图片模板是否出现在当前屏幕上。',
      '- `v`：目标对象，通常为 `Template`',
      '返回：未找到返回 `False`；找到则返回匹配坐标（可直接用于 `touch`）',
      '示例：`pos = exists(Template("tpl.png"))`，若 `pos` 非空可 `touch(pos)` 减少一次查找',
    ].join('\n'),
    'find_all(Template("tpl.png"))': [
      '**find_all(v)**',
      '查找目标在设备屏幕上的所有出现位置。',
      '- `v`：目标对象，通常为 `Template`',
      '返回：结果列表，每项含 `result`（坐标）、`rectangle`（匹配矩形）、`confidence`（置信度）',
      '示例：`find_all(Template("tpl.png"))`',
    ].join('\n'),
    'wait(Template("tpl.png"), timeout=10)': [
      '**wait(v, timeout=None, interval=0.5, intervalfunc=None)**',
      '等待图片模板出现在设备屏幕上。',
      '- `v`（Template）：要等待匹配的目标',
      '- `timeout`（float）：超时秒数，默认 `ST.FIND_TIMEOUT`',
      '- `interval`（float）：每次查找的间隔秒数，默认 0.5',
      '- `intervalfunc`：每次未找到时调用的回调函数',
      '返回：匹配目标的坐标；超时未找到会抛出 `TargetNotFoundError`',
      '示例：`wait(Template("tpl.png"), timeout=10)`',
    ].join('\n'),
    'start_app("com.package")': [
      '**start_app(package, activity=None)**',
      '在设备上启动目标应用。',
      '- `package`（str）：包名，如 `"com.netease.cloudmusic"`',
      '- `activity`（str）：要启动的 Activity，默认主 Activity',
      '返回：`None`',
      '示例：`start_app("com.netease.cloudmusic")`',
    ].join('\n'),
    'stop_app("com.package")': [
      '**stop_app(package)**',
      '停止设备上的目标应用。',
      '- `package`（str）：要停止的包名',
      '返回：`None`',
      '示例：`stop_app("com.netease.cloudmusic")`',
    ].join('\n'),
    'clear_app("com.package")': [
      '**clear_app(package)**',
      '清除目标应用的数据（等同 `adb shell pm clear`）。',
      '- `package`（str）：包名',
      '返回：`None`',
      '示例：`clear_app("com.netease.cloudmusic")`',
    ].join('\n'),
    'install("app.apk")': [
      '**install(filepath, **kwargs)**',
      '在设备上安装应用。',
      '- `filepath`（str）：本地 apk/ipa 文件路径或下载 URL',
      '- `install_options`（list，Android）：安装参数，如 `["-r", "-t"]`',
      '返回：`None`',
      '示例：`install("app.apk")`、`install("app.apk", install_options=["-r"])`',
    ].join('\n'),
    'uninstall("com.package")': [
      '**uninstall(package)**',
      '卸载设备上的目标应用。',
      '- `package`（str）：包名',
      '返回：`None`',
      '示例：`uninstall("com.netease.cloudmusic")`',
    ].join('\n'),
    'd.shell("pwd")': [
      '**shell(cmd)** / **d.shell(cmd)**（设备方法）',
      '在目标设备上执行远程 shell 命令（Android 为 `adb shell`）。',
      '- `cmd`（str）：要执行的命令，如 `"ls /data/local/tmp"`',
      '返回：命令输出',
      '示例：`d.shell("pwd")`',
    ].join('\n'),
    'd.adb.push("local", "remote")': [
      '**push(local, remote)**（设备方法，等价顶层 `push()`）',
      '把本地文件推送到远程设备。',
      '- `local`（str）：本地文件路径',
      '- `remote`（str）：设备上的目标路径',
      '返回：被推送的文件名',
      '示例：`d.adb.push("local.txt", "/data/local/tmp/")`',
    ].join('\n'),
    'd.adb.pull("remote", "local")': [
      '**pull(remote, local)**（设备方法，等价顶层 `pull()`）',
      '把远程设备上的文件拉取到本地。',
      '- `remote`（str）：设备上的文件路径',
      '- `local`（str）：本地保存路径',
      '返回：被拉取的文件名',
      '示例：`d.adb.pull("/data/local/tmp/a.txt", "a.txt")`',
    ].join('\n'),
    'd.set_clipboard("text")': [
      '**set_clipboard(content)**（设备方法，等价顶层 `set_clipboard()`）',
      '设置设备的剪贴板内容。',
      '- `content`（str）：要写入剪贴板的文本',
      '返回：`None`',
      '示例：`d.set_clipboard("hello")`',
    ].join('\n'),
    'd.get_clipboard()': [
      '**get_clipboard()**（设备方法，等价顶层 `get_clipboard()`）',
      '获取设备的剪贴板内容。',
      '返回：剪贴板文本（str）',
      '示例：`d.get_clipboard()`',
    ].join('\n'),
    'd.get_current_resolution()': [
      '**d.get_current_resolution()**（设备方法）',
      '获取当前设备屏幕的分辨率（宽 × 高）。',
      '返回：分辨率，如 `(1080, 1920)`',
      '示例：`d.get_current_resolution()`',
    ].join('\n'),
    'd.get_top_activity()': [
      '**d.get_top_activity()**（设备方法，Android）',
      '获取设备当前前台（顶层）Activity 的信息。',
      '返回：包含 `package`、`activity` 等字段的结果对象',
      '示例：`d.get_top_activity()`',
    ].join('\n'),
    'log("message")': [
      '**log(arg, timestamp=None, desc="", snapshot=False)**',
      '插入一条用户日志，会显示在 HTML 测试报告中。',
      '- `arg`：日志内容，或 `Exception` 异常对象',
      '- `desc`（str）：日志描述；`snapshot`（bool）：是否附带截图，默认 `False`',
      '返回：`None`',
      '示例：`log("hello world", snapshot=True)`',
    ].join('\n'),
  }

  // ---------- Python 语法提示（关键字 / 内置函数 / import / 代码片段） ----------
  const d = (...lines) => lines.join('\n')
  const py = (name, label, insertText, kind, doc, extra) =>
    Object.assign({ name, label, insertText, kind, doc, snippet: false }, extra || {})

  const PYTHON_KEYWORDS = [
    py('if', 'if', 'if', 'keyword',
      d('**if** 条件语句', '当条件为真时执行缩进代码块。', '示例：`if x > 0:\n    print(x)`')),
    py('elif', 'elif', 'elif', 'keyword',
      d('**elif** 否则如果', '与 if 配合，前序条件都不成立时再判断。', '示例：`elif x == 0:`')),
    py('else', 'else', 'else', 'keyword',
      d('**else** 否则', '所有条件都不成立时执行；也可用于 for/while/try。', '示例：`else:\n    pass`')),
    py('for', 'for', 'for', 'keyword',
      d('**for** 循环', '遍历序列中的每个元素。', '示例：`for i in range(10):\n    print(i)`')),
    py('while', 'while', 'while', 'keyword',
      d('**while** 循环', '条件为真时重复执行。', '示例：`while True:\n    break`')),
    py('break', 'break', 'break', 'keyword',
      d('**break** 跳出循环', '立即终止最近的 for/while 循环。')),
    py('continue', 'continue', 'continue', 'keyword',
      d('**continue** 继续', '跳过本次循环剩余语句，进入下一轮。')),
    py('def', 'def', 'def', 'keyword',
      d('**def** 定义函数', '声明一个函数。', '示例：`def foo(x):\n    return x + 1`')),
    py('return', 'return', 'return', 'keyword',
      d('**return** 返回', '从函数返回值并结束函数。', '示例：`return x + 1`')),
    py('class', 'class', 'class', 'keyword',
      d('**class** 定义类', '声明一个类。', '示例：`class A:\n    pass`')),
    py('lambda', 'lambda', 'lambda', 'keyword',
      d('**lambda** 匿名函数', '定义简短的匿名函数。', '示例：`f = lambda x: x + 1`')),
    py('try', 'try', 'try', 'keyword',
      d('**try** 异常捕获', '捕获代码块中的异常，配合 except/finally。')),
    py('except', 'except', 'except', 'keyword',
      d('**except** 异常处理', '当 try 中发生指定异常时执行。', '示例：`except Exception as e:`')),
    py('finally', 'finally', 'finally', 'keyword',
      d('**finally** 最终执行', '无论是否发生异常都会执行的代码块。')),
    py('raise', 'raise', 'raise', 'keyword',
      d('**raise** 抛出异常', '主动抛出一个异常。', '示例：`raise ValueError("bad")`')),
    py('with', 'with', 'with', 'keyword',
      d('**with** 上下文管理', '自动管理资源（如文件），退出时自动清理。', '示例：`with open("a.txt") as f:`')),
    py('as', 'as', 'as', 'keyword',
      d('**as** 别名', '为导入模块或异常指定别名。', '示例：`import os as myos`')),
    py('import', 'import', 'import', 'keyword',
      d('**import** 导入模块', '导入一个模块。', '示例：`import time`')),
    py('from', 'from', 'from', 'keyword',
      d('**from** 从模块导入', '从模块中导入指定成员。', '示例：`from airtest.core.api import *`')),
    py('pass', 'pass', 'pass', 'keyword',
      d('**pass** 空语句', '占位语句，什么都不做。')),
    py('assert', 'assert', 'assert', 'keyword',
      d('**assert** 断言', '条件为假时抛出 AssertionError。', '示例：`assert x > 0`')),
    py('yield', 'yield', 'yield', 'keyword',
      d('**yield** 生成器', '在生成器中产出一个值。')),
    py('global', 'global', 'global', 'keyword',
      d('**global** 全局变量', '声明在函数内使用全局变量。')),
    py('in', 'in', 'in', 'keyword',
      d('**in** 属于', '判断元素是否在序列中。', '示例：`if x in items:`')),
    py('is', 'is', 'is', 'keyword',
      d('**is** 同一对象', '判断两个变量是否引用同一对象。')),
    py('not', 'not', 'not', 'keyword',
      d('**not** 逻辑非', '对布尔值取反。')),
  ]

  const PYTHON_BUILTINS = [
    py('print', 'print', 'print', 'function',
      d('**print(...)** 打印', '输出内容到控制台/日志。', '示例：`print("hello", x)`')),
    py('len', 'len', 'len', 'function',
      d('**len(obj)** 长度', '返回对象的元素个数。', '示例：`len(items)`')),
    py('range', 'range', 'range', 'function',
      d('**range(start, stop, step)** 范围', '生成整数序列，常用于 for 循环。', '示例：`range(0, 10, 2)`')),
    py('str', 'str', 'str', 'function',
      d('**str(x)** 转字符串', '将对象转换为字符串。')),
    py('int', 'int', 'int', 'function',
      d('**int(x)** 转整数', '将字符串或数字转换为整数。')),
    py('float', 'float', 'float', 'function',
      d('**float(x)** 转浮点', '将对象转换为浮点数。')),
    py('bool', 'bool', 'bool', 'function',
      d('**bool(x)** 转布尔', '将对象转换为 True/False。')),
    py('list', 'list', 'list', 'function',
      d('**list(x)** 列表', '创建一个列表。')),
    py('dict', 'dict', 'dict', 'function',
      d('**dict()** 字典', '创建一个字典。')),
    py('set', 'set', 'set', 'function',
      d('**set(x)** 集合', '创建一个无序不重复集合。')),
    py('tuple', 'tuple', 'tuple', 'function',
      d('**tuple(x)** 元组', '创建一个元组。')),
    py('type', 'type', 'type', 'function',
      d('**type(x)** 类型', '返回对象的类型。')),
    py('isinstance', 'isinstance', 'isinstance', 'function',
      d('**isinstance(x, T)** 类型判断', '判断对象是否为指定类型。', '示例：`isinstance(x, int)`')),
    py('enumerate', 'enumerate', 'enumerate', 'function',
      d('**enumerate(seq)** 枚举', '遍历时同时获得索引和值。', '示例：`for i, v in enumerate(items):`')),
    py('zip', 'zip', 'zip', 'function',
      d('**zip(a, b)** 打包', '将多个序列按位置打包成元组。')),
    py('min', 'min', 'min', 'function',
      d('**min(x)** 最小值', '返回序列中的最小值。')),
    py('max', 'max', 'max', 'function',
      d('**max(x)** 最大值', '返回序列中的最大值。')),
    py('sum', 'sum', 'sum', 'function',
      d('**sum(x)** 求和', '返回序列元素之和。')),
    py('abs', 'abs', 'abs', 'function',
      d('**abs(x)** 绝对值', '返回数值的绝对值。')),
    py('sorted', 'sorted', 'sorted', 'function',
      d('**sorted(x)** 排序', '返回排序后的新列表。')),
    py('open', 'open', 'open', 'function',
      d('**open(file, mode)** 打开文件', '打开文件并返回文件对象，建议配合 with。', '示例：`open("a.txt", "r")`')),
    py('input', 'input', 'input', 'function',
      d('**input(prompt)** 输入', '读取一行输入（自动化脚本中较少用）。')),
    py('map', 'map', 'map', 'function',
      d('**map(f, seq)** 映射', '对序列每个元素应用函数。')),
    py('filter', 'filter', 'filter', 'function',
      d('**filter(f, seq)** 过滤', '保留使函数返回真的元素。')),
    py('any', 'any', 'any', 'function',
      d('**any(x)** 任一为真', '序列中任一元素为真则返回 True。')),
    py('all', 'all', 'all', 'function',
      d('**all(x)** 全部为真', '序列中所有元素为真才返回 True。')),
    py('super', 'super', 'super', 'function',
      d('**super()** 父类', '调用父类的方法。')),
  ]

  const PYTHON_IMPORTS = [
    py('from airtest.core.api import *', 'airtest.core.api', 'from airtest.core.api import *', 'module',
      d('**airtest.core.api**', '导入 Airtest 全部 API（touch/swipe/wait 等）。', '脚本开头通常需要这一行。')),
    py('from airtest.core.api import', 'airtest.core.api import', 'from airtest.core.api import ', 'module',
      d('**from airtest.core.api import ...**', '按需导入指定的 Airtest API。')),
    py('import os', 'os', 'import os', 'module',
      d('**os** 操作系统接口', '文件路径、目录、环境变量等操作。')),
    py('import sys', 'sys', 'import sys', 'module',
      d('**sys** 系统相关', '解释器参数、路径、退出等。')),
    py('import time', 'time', 'import time', 'module',
      d('**time** 时间', 'time.sleep()、时间戳等。')),
    py('import json', 'json', 'import json', 'module',
      d('**json** JSON 编解码', 'json.dumps()/json.loads()。')),
    py('import re', 're', 'import re', 'module',
      d('**re** 正则表达式', '字符串匹配与替换。')),
    py('import random', 'random', 'import random', 'module',
      d('**random** 随机数', '生成随机数、随机选择。')),
    py('import math', 'math', 'import math', 'module',
      d('**math** 数学函数', 'sqrt、sin、pi 等数学常量与函数。')),
    py('import datetime', 'datetime', 'import datetime', 'module',
      d('**datetime** 日期时间', '日期与时间的运算。')),
  ]

  const PYTHON_SNIPPETS = [
    py('for 循环', 'for 循环', 'for ${1:i} in ${2:range(10)}:\n    ${3:pass}', 'snippet',
      d('**for 循环模板**', '遍历序列，插入后用 Tab 依次填写变量、序列、循环体。'), { snippet: true, filterText: 'for' }),
    py('if 判断', 'if 判断', 'if ${1:condition}:\n    ${2:pass}', 'snippet',
      d('**if 判断模板**', '条件语句模板。'), { snippet: true, filterText: 'if' }),
    py('if-else', 'if-else', 'if ${1:condition}:\n    ${2:pass}\nelse:\n    ${3:pass}', 'snippet',
      d('**if-else 模板**', '带 else 分支的条件语句。'), { snippet: true, filterText: 'if' }),
    py('while 循环', 'while 循环', 'while ${1:condition}:\n    ${2:pass}', 'snippet',
      d('**while 循环模板**', '条件循环模板。'), { snippet: true, filterText: 'while' }),
    py('定义函数', 'def 函数', 'def ${1:name}(${2:args}):\n    ${3:pass}', 'snippet',
      d('**函数定义模板**', '定义函数，Tab 填写函数名、参数、函数体。'), { snippet: true, filterText: 'def' }),
    py('定义类', 'class 类', 'class ${1:Name}:\n    def ${2:__init__}(self${3:}):\n        ${4:pass}', 'snippet',
      d('**类定义模板**', '定义类及初始化方法。'), { snippet: true, filterText: 'class' }),
    py('try-except', 'try-except', 'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:pass}', 'snippet',
      d('**try-except 模板**', '异常捕获模板。'), { snippet: true, filterText: 'try' }),
    py('main 入口', 'main', 'if __name__ == "__main__":\n    ${1:pass}', 'snippet',
      d('**主入口模板**', '脚本作为主程序运行时执行的代码。'), { snippet: true, filterText: 'main' }),
  ]

  // 统一补全项：airtest API + Python 关键字/内置函数/import/片段
  const AIRTEST_COMPLETIONS = ANDROID_COMPLETIONS.map(c => {
    const label = c.value.split('(')[0].replace(/[^a-zA-Z_]/g, '') || c.name
    return {
      name: c.name, label, insertText: c.value, snippet: false, kind: 'function',
      detail: 'airtest · ' + c.name, doc: AIRTEST_API_DOCS[c.value] || '',
    }
  })
  const taggedPython = list => list.map(c => Object.assign({}, c, { detail: 'python · ' + c.label }))
  const COMPLETIONS = [].concat(
    AIRTEST_COMPLETIONS,
    taggedPython(PYTHON_KEYWORDS),
    taggedPython(PYTHON_BUILTINS),
    taggedPython(PYTHON_IMPORTS),
    taggedPython(PYTHON_SNIPPETS),
  )

  return {
    nodeCenter, genTouch, genTouchNode, genTemplateTap, genKeyevent, genIOSHome,
    hasNonAscii, genInput, genClear, genClearCode, genPreloadCode, genPythonCode,
    genSelectorDisplay, ANDROID_COMPLETIONS, AIRTEST_API_DOCS,
    PYTHON_KEYWORDS, PYTHON_BUILTINS, PYTHON_IMPORTS, PYTHON_SNIPPETS, COMPLETIONS,
  }
})
