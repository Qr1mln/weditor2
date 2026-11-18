import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nodeCenter, genTouch, genTouchNode, genTemplateTap, genKeyevent,
  genInput, genClear, genClearCode, genPreloadCode, genPythonCode,
  genSelectorDisplay, hasNonAscii, ANDROID_COMPLETIONS,
} from '../src/codegen.js'

const node = { rect: { x: 100, y: 200, width: 50, height: 40 }, resourceId: 'btn' }

test('nodeCenter rounds to integer center', () => {
  assert.deepEqual(nodeCenter(node), [125, 220])
  assert.equal(nodeCenter(null), null)
  assert.equal(nodeCenter({}), null)
})

test('touch code generation', () => {
  assert.equal(genTouch(10, 20), 'touch((10, 20))')
  assert.equal(genTouchNode(node), 'touch((125, 220))')
  assert.equal(genTouchNode({}), '')
})

test('template tap uses absolute path form', () => {
  assert.equal(genTemplateTap('C:/x/tpl.png'), 'touch(Template("C:/x/tpl.png"))')
})

test('keyevent mapping', () => {
  assert.equal(genKeyevent('home'), 'keyevent("HOME")')
  assert.equal(genKeyevent('back'), 'keyevent("BACK")')
  assert.equal(genKeyevent('power'), 'keyevent("POWER")')
  assert.equal(genKeyevent('menu'), 'keyevent("MENU")')
  assert.equal(genKeyevent('unknown'), 'keyevent("UNKNOWN")')
})

test('input and clear use DEL keyevents', () => {
  assert.ok(genInput('hi').endsWith('text("hi")'))
  assert.equal(genInput('hi', 2).split('\n').length, 3)
  assert.equal(genClear(3).split('\n').length, 3)
  assert.ok(genClear().includes('KEYCODE_DEL'))
})

test('CJK input uses input_text (ADB_INPUT_B64) instead of text()', () => {
  const code = genInput('你好', 2)
  assert.ok(code.endsWith('input_text("你好")'))
  assert.ok(!code.split('\n').includes('text("你好")'))
})

test('editor template and python wrapper', () => {
  assert.ok(genClearCode().includes('from airtest.core.api import *'))
  assert.ok(genPythonCode('touch((1,2))').includes('d = device()'))
  assert.ok(genPythonCode('touch((1,2))').endsWith('touch((1,2))'))
})

test('preload code for android and ios', () => {
  const a = genPreloadCode('android:emulator-5554')
  assert.ok(a.includes('connect_device("Android:///emulator-5554")'))
  assert.ok(a.includes('d = device()'))
  const i = genPreloadCode('ios:0000-1234')
  assert.ok(i.includes('wda.Client()'))
  assert.ok(genPreloadCode('androidadb:serial').includes('connect_device'))
  assert.ok(genPreloadCode('bogus:x').includes('Unsupported'))
})

test('selector display respects tapMode', () => {
  assert.equal(genSelectorDisplay(node, 'coordinate'), 'touch((125, 220))')
  assert.ok(genSelectorDisplay(node, 'template').includes('Template'))
})

test('non-ascii detection', () => {
  assert.equal(hasNonAscii('abc'), false)
  assert.equal(hasNonAscii('你好'), true)
})

test('completions are airtest-only', () => {
  const values = ANDROID_COMPLETIONS.map(c => c.value).join(' ')
  assert.ok(values.includes('touch('))
  assert.ok(values.includes('keyevent('))
  assert.ok(!values.includes('d.press'))
  assert.ok(!values.includes('d.xpath'))
  assert.ok(!values.includes('u2.'))
})
