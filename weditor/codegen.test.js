import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const C = require('./codegen.js')

const node = (x, y, w, h, extra = {}) => ({ rect: { x, y, width: w, height: h }, ...extra })

test('nodeCenter rounds to integer center', () => {
  assert.deepEqual(C.nodeCenter(node(0, 0, 5, 5)), [3, 3])
  assert.deepEqual(C.nodeCenter(node(10, 20, 4, 6)), [12, 23])
  assert.equal(C.nodeCenter(null), null)
  assert.equal(C.nodeCenter({}), null)
})

test('touch code generation', () => {
  assert.equal(C.genTouch(245, 360), 'touch((245, 360))')
  assert.equal(C.genTouchNode(node(100, 200, 40, 20)), 'touch((120, 210))')
})

test('template tap uses absolute path form', () => {
  assert.equal(C.genTemplateTap('C:/x/btn.png'), 'touch(Template("C:/x/btn.png"))')
})

test('keyevent mapping', () => {
  assert.equal(C.genKeyevent('home'), 'keyevent("HOME")')
  assert.equal(C.genKeyevent('back'), 'keyevent("BACK")')
  assert.equal(C.genKeyevent('volume_up'), 'keyevent("VOLUME_UP")')
})

test('input and clear use DEL keyevents', () => {
  assert.equal(C.genClear(2), 'keyevent("KEYCODE_DEL")\nkeyevent("KEYCODE_DEL")')
  const s = C.genInput('abc', 2)
  assert.ok(s.startsWith('keyevent("KEYCODE_DEL")\nkeyevent("KEYCODE_DEL")\n'))
  assert.ok(s.endsWith('text("abc")'))
})

test('CJK input uses input_text (ADB_INPUT_B64) instead of text()', () => {
  assert.ok(C.genInput('你好', 2).endsWith('input_text("你好")'))
  assert.equal(C.hasNonAscii('你好'), true)
  assert.equal(C.hasNonAscii('abc'), false)
})

test('editor template and python wrapper', () => {
  const android = C.genClearCode('Android', 'emulator-5554')
  assert.ok(android.includes('from airtest.core.api import *'))
  assert.ok(android.includes('connect_device("Android:///emulator-5554")'))
  assert.ok(android.includes('log("hello world")'))
  assert.ok(C.genClearCode('iOS', '0000').includes('wda.Client()'))
  assert.ok(C.genPythonCode('touch((1, 2))').endsWith('touch((1, 2))'))
})

test('preload code for android and ios', () => {
  assert.ok(C.genPreloadCode('android:emulator-5554').includes('connect_device("Android:///emulator-5554")'))
  assert.ok(C.genPreloadCode('ios:0000').includes('wda.Client()'))
  assert.ok(C.genPreloadCode('bogus').includes('Unsupported'))
})

test('selector display respects tapMode', () => {
  assert.equal(C.genSelectorDisplay(node(0, 0, 10, 10)), 'touch((5, 5))')
  assert.ok(C.genSelectorDisplay(node(0, 0, 10, 10), 'template').includes('Template'))
})

test('non-ascii detection', () => {
  assert.equal(C.hasNonAscii(''), false)
  assert.equal(C.hasNonAscii('a\n'), false)
  assert.equal(C.hasNonAscii('é'), true)
})

test('completions are airtest-only', () => {
  assert.ok(C.ANDROID_COMPLETIONS.length >= 20)
  assert.ok(C.ANDROID_COMPLETIONS.some(c => c.value === 'input_text("你好")'))
  assert.ok(!C.ANDROID_COMPLETIONS.some(c => /uiautomator|\.xpath\(/.test(c.value)))
})
