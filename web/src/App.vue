<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDeviceStore } from './stores/device'
import { useShellStore } from './stores/shell'
import { useEditorStore } from './stores/editor'
import { genPreloadCode, genClearCode, genTouch, genTouchNode, ANDROID_COMPLETIONS } from './codegen'

const device = useDeviceStore()
const shell = useShellStore()
const editor = useEditorStore()

const version = ref('...')
const screenImg = ref(null)
const selectedNode = ref(null)
const hierarchyTree = ref([])
const bgCanvas = ref(null)
const fgCanvas = ref(null)
const codeContainer = ref(null)
let monacoEditor = null

const selectedInfo = computed(() => selectedNode.value || {})

async function fetchVersion() {
  try {
    const r = await fetch('/api/v1/version')
    const d = await r.json()
    version.value = d.version || 'unknown'
  } catch (e) { version.value = 'ERR' }
}

async function doConnect() {
  try {
    await device.connect()
    ElMessage.success('Connected: ' + device.deviceId)
    shell.connect()
    shell.run(genPreloadCode(device.deviceId))
    if (editor.code === '') editor.setCode(genClearCode())
  } catch (e) {
    ElMessage.error('Connect failed: ' + e.message)
  }
}

async function dumpHierarchy() {
  if (!device.deviceId) return ElMessage.warning('Connect first')
  try {
    device.loading = true
    const id = encodeURIComponent(device.deviceId)
    const v2 = await fetch(`/api/v2/devices/${id}/hierarchy`).then(r => r.json())
    device.hierarchy = v2
    hierarchyTree.value = v2.jsonHierarchy ? [v2.jsonHierarchy] : []
    const shot = await fetch(`/api/v1/devices/${id}/screenshot`).then(r => r.json())
    screenImg.value = 'data:image/jpeg;base64,' + shot.data
    localStorage.setItem('screenshotBase64', shot.data)
  } catch (e) {
    ElMessage.error('Dump failed: ' + e.message)
  } finally {
    device.loading = false
  }
}

function treeLabel(n) {
  if (!n) return ''
  return n.text || n.resourceId || n.description || n._type || n.name || '(node)'
}

function onNodeClick(data) {
  if (!data.rect) return
  selectedNode.value = data
  editor.generatedCode = genTouchNode(data)
}

function doTap() {
  if (!selectedNode.value) return
  const code = editor.generatedCode || genTouchNode(selectedNode.value)
  if (!code) return
  editor.setCode(code)
  shell.run(code)
}

function runCode() {
  const code = monacoEditor ? monacoEditor.getValue() : editor.code
  if (code) shell.run(code)
}

function runSelected() {
  if (!monacoEditor) return runCode()
  const sel = monacoEditor.getModel().getValueInRange(monacoEditor.getSelection())
  shell.run(sel || monacoEditor.getValue())
}

function runCurrentLine() {
  if (!monacoEditor) return runCode()
  const line = monacoEditor.getPosition().lineNumber
  const code = monacoEditor.getModel().getLineContent(line)
  shell.run(code)
}

async function initMonaco() {
  // Load only the editor core + Python language (avoids bundling 90+ language modes).
  const monaco = await import('monaco-editor/esm/vs/editor/editor.api')
  await import('monaco-editor/esm/vs/basic-languages/python/python.contribution')
  await import('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController')
  monacoEditor = monaco.editor.create(codeContainer.value, {
    value: editor.code || genClearCode(),
    language: 'python',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    quickSuggestions: { other: true, comments: false, strings: false },
    suggestOnTriggerCharacters: true,
  })
  monacoEditor.onDidChangeModelContent(() => {
    editor.setCode(monacoEditor.getValue())
  })
  // airtest API completion (word-based)
  monaco.languages.registerCompletionItemProvider('python', {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return {
        suggestions: ANDROID_COMPLETIONS.map(c => ({
          label: c.value.split('(')[0].replace(/[^a-zA-Z_]/g, '') || c.name,
          insertText: c.value,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: 'airtest · ' + c.name,
          filterText: c.value,
          sortText: c.name,
          range,
        })),
      }
    },
  })
}

watch(() => editor.code, (v) => {
  if (monacoEditor && monacoEditor.getValue() !== v) monacoEditor.setValue(v)
})

watch(() => shell.lastLineno, (n) => {
  if (monacoEditor && n != null) {
    monacoEditor.revealLineInCenter(n)
    monacoEditor.setPosition({ lineNumber: n, column: 1 })
  }
})

onMounted(async () => {
  fetchVersion()
  await initMonaco()
})
onUnmounted(() => {
  if (monacoEditor) monacoEditor.dispose()
  if (screenImg.value) URL.revokeObjectURL(screenImg.value)
})
</script>

<template>
  <el-container class="layout">
    <el-header class="header">
      <span class="brand">WEditor <small>{{ version }}</small></span>
      <el-select v-model="device.platform" size="small" style="width: 150px">
        <el-option label="Android AirTest" value="Android" />
        <el-option label="Android ADB" value="AndroidADB" />
        <el-option label="iOS" value="iOS" />
      </el-select>
      <el-input v-model="device.serial" size="small" placeholder="device url" style="width: 200px" />
      <el-button size="small" type="primary" :loading="device.connecting" @click="doConnect">Connect</el-button>
      <el-button size="small" :loading="device.loading" @click="dumpHierarchy">Dump</el-button>
      <span v-if="device.deviceId" class="devid">{{ device.deviceId }}</span>
    </el-header>

    <el-container class="main">
      <!-- Left: screenshot -->
      <el-aside width="42%" class="pane screen-pane">
        <div class="panel-title">Screen</div>
        <div class="screen-area">
          <img v-if="screenImg" :src="screenImg" class="screen-img" />
          <div v-else class="placeholder">No screenshot. Connect &amp; Dump.</div>
        </div>
      </el-aside>

      <!-- Middle: selected element -->
      <el-main class="pane attr-pane">
        <div class="panel-title">
          Selected Element
          <el-button size="small" :disabled="!selectedNode" @click="doTap">Tap</el-button>
        </div>
        <el-descriptions :column="1" size="small" border v-if="selectedNode">
          <el-descriptions-item label="class">{{ selectedInfo._type }}</el-descriptions-item>
          <el-descriptions-item label="resource-id">{{ selectedInfo.resourceId }}</el-descriptions-item>
          <el-descriptions-item label="text">{{ selectedInfo.text }}</el-descriptions-item>
          <el-descriptions-item label="bounds">{{ JSON.stringify(selectedInfo.rect) }}</el-descriptions-item>
        </el-descriptions>
        <div v-else class="placeholder">Click a node in the hierarchy tree.</div>
        <div class="code-hint">
          <div>Generated code</div>
          <el-input size="small" :model-value="editor.generatedCode" readonly />
        </div>
      </el-main>

      <!-- Right: editor + tree -->
      <el-aside width="42%" class="pane code-pane">
        <div class="panel-title">
          Coding
          <el-radio-group v-model="editor.tapMode" size="small">
            <el-radio-button value="coordinate">坐标</el-radio-button>
            <el-radio-button value="template">模板</el-radio-button>
          </el-radio-group>
          <el-button size="small" type="primary" @click="runCode">Run</el-button>
          <el-button size="small" @click="runSelected">Sel</el-button>
          <el-button size="small" @click="runCurrentLine">Line</el-button>
          <el-button size="small" type="warning" :disabled="!shell.running" @click="shell.interrupt()">Stop</el-button>
          <el-button size="small" :loading="shell.restarting" @click="shell.restart()">Restart</el-button>
        </div>
        <div ref="codeContainer" class="editor-container"></div>
        <el-tabs class="bottom-tabs">
          <el-tab-pane label="Hierarchy">
            <el-tree :data="hierarchyTree" node-key="_id" default-expand-all
              :props="{ children: 'children', label: (d) => treeLabel(d) }"
              @node-click="onNodeClick" />
          </el-tab-pane>
          <el-tab-pane label="Console">
            <pre class="console">{{ shell.output.map(o => o.value).join('') }}</pre>
          </el-tab-pane>
        </el-tabs>
      </el-aside>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout { height: 100vh; }
.header { display: flex; align-items: center; gap: 10px; background: #f5f7fa; border-bottom: 1px solid #ddd; }
.brand { font-weight: bold; font-size: 18px; margin-right: 12px; }
.brand small { font-weight: normal; color: #888; }
.devid { color: #67c23a; font-size: 12px; }
.main { height: calc(100vh - 60px); }
.pane { border-right: 1px solid #ddd; padding: 8px; overflow: auto; }
.panel-title { display: flex; align-items: center; gap: 8px; font-weight: bold; margin-bottom: 8px; }
.screen-area { background: #000; min-height: 400px; display: flex; align-items: center; justify-content: center; }
.screen-img { max-width: 100%; max-height: 70vh; }
.placeholder { color: #999; font-size: 13px; text-align: center; padding: 20px; }
.code-hint { margin-top: 16px; }
.editor-container { height: 260px; border: 1px solid #ddd; }
.bottom-tabs { margin-top: 8px; }
.console { font-size: 12px; max-height: 200px; overflow: auto; background: #1e1e1e; color: #d4d4d4; padding: 8px; }
</style>
