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

  function genClearCode() {
    return [
      '# coding: utf-8',
      '#',
      'from airtest.core.api import *',
      '',
      'd = device()',
      '',
      '',
    ].join('\n')
  }

  function genPreloadCode(deviceId) {
    const m = /^([^:]+):(.*)/.exec(deviceId || '')
    if (!m) return 'print("Unsupported deviceId: ' + deviceId + '")'
    const prefix = m[1]
    const deviceUrl = m[2]
    if (prefix === 'ios') {
      return [
        "print('Set environment for iOS device\\nInit c = d = wda.Client()')",
        'import os',
        'import wda',
        `os.environ['DEVICE_URL'] = "${deviceUrl}"`,
        'c = d = wda.Client()',
      ].join('\n')
    }
    if (prefix === 'android' || prefix === 'androidadb') {
      return [
        "print('Set environment and prepare airtest device')",
        'from airtest.core.api import *',
        `connect_device("Android:///${deviceUrl}")`,
        'd = device()',
      ].join('\n')
    }
    return `print("Unsupported deviceId: ${deviceId}")`
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

  return {
    nodeCenter, genTouch, genTouchNode, genTemplateTap, genKeyevent, genIOSHome,
    hasNonAscii, genInput, genClear, genClearCode, genPreloadCode, genPythonCode,
    genSelectorDisplay, ANDROID_COMPLETIONS,
  }
})
