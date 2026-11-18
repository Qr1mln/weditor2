/* WEditor frontend - Vue 3 global build, no bundler.
 * Replaces the former Vue3 SFC + Pinia app with a single script-tag driven file. */
(function () {
  'use strict'

  const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue
  const C = window.Codegen
  const SPLIT_RATIO_KEY = 'weditor.splitRatio'

  function loadSplitRatio() {
    const saved = Number.parseFloat(localStorage.getItem(SPLIT_RATIO_KEY))
    return Number.isFinite(saved) && saved >= 5 && saved <= 95 ? saved : 50
  }

  // ---------- state (formerly Pinia stores) ----------
  const device = {
    platform: ref(localStorage.getItem('platform') || 'Android'),
    serial: ref(localStorage.getItem('serial') || ''),
    deviceId: ref(''),
    connecting: ref(false),
    loading: ref(false),
    hierarchy: ref(null),
  }
  watch(device.platform, v => localStorage.setItem('platform', v))
  watch(device.serial, v => localStorage.setItem('serial', v))

  const shell = {
    ws: null,
    wsOpen: ref(false),
    running: ref(false),
    restarting: ref(false),
    output: ref([]),
    lastLineno: ref(null),
  }

  const editor = {
    code: ref(''),
    generatedCode: ref(''),
    tapMode: ref(localStorage.getItem('tapMode') || 'coordinate'),
  }
  watch(editor.tapMode, v => localStorage.setItem('tapMode', v))

  // ---------- app ----------
  createApp({
    setup() {
      const version = ref('...')
      const screenImg = ref(null)
      const selectedNode = ref(null)
      const hierarchyTree = ref([])
      const codeContainer = ref(null)
      const screenAreaEl = ref(null)
      const screenImgEl = ref(null)
      const screenPaneWidth = ref(loadSplitRatio() + '%')
      const splitterActive = ref(false)
      const frameStyle = ref({})
      const rightTab = ref('coding')
      let monacoEditor = null
      let splitting = false

      const selectedInfo = computed(() => selectedNode.value || {})

      function fitScreen() {
        const area = screenAreaEl.value
        const img = screenImgEl.value
        if (!area || !img || !img.naturalWidth || !img.naturalHeight) return
        const aw = area.clientWidth
        const ah = area.clientHeight
        if (!aw || !ah) return
        const ratio = img.naturalWidth / img.naturalHeight
        let w = aw
        let h = w / ratio
        if (h > ah) {
          h = ah
          w = h * ratio
        }
        frameStyle.value = { width: Math.round(w) + 'px', height: Math.round(h) + 'px' }
      }

      function getMainElement() {
        return document.querySelector('.main')
      }

      function clampSplitRatio(ratio, rect) {
        const minLeft = 240
        const minRight = 300
        const maxLeft = Math.max(minLeft, rect.width - minRight)
        const minRatio = Math.min(50, minLeft / rect.width * 100)
        const maxRatio = Math.max(minRatio, maxLeft / rect.width * 100)
        return Math.min(Math.max(ratio, minRatio), maxRatio)
      }

      function resizeSplitter(e) {
        const main = getMainElement()
        if (!main) return
        const rect = main.getBoundingClientRect()
        if (!rect.width) return
        const minLeft = 240
        const minRight = 300
        const maxLeft = Math.max(minLeft, rect.width - minRight)
        const width = Math.min(Math.max(e.clientX - rect.left, minLeft), maxLeft)
        const ratio = clampSplitRatio(width / rect.width * 100, rect)
        screenPaneWidth.value = ratio.toFixed(2) + '%'
        localStorage.setItem(SPLIT_RATIO_KEY, ratio.toFixed(2))
        nextTick(() => { if (monacoEditor) monacoEditor.layout() })
      }

      function stopSplitResize() {
        if (!splitting) return
        splitting = false
        splitterActive.value = false
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        document.removeEventListener('mousemove', resizeSplitter)
        document.removeEventListener('mouseup', stopSplitResize)
      }

      function startSplitResize(e) {
        if (splitting || (e.button != null && e.button !== 0)) return
        e.preventDefault()
        splitting = true
        splitterActive.value = true
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'
        document.addEventListener('mousemove', resizeSplitter)
        document.addEventListener('mouseup', stopSplitResize)
      }

      async function fetchVersion() {
        try {
          const d = await fetch('/api/v1/version').then(r => r.json())
          version.value = d.version || 'unknown'
        } catch (e) { version.value = 'ERR' }
      }

      function shellConnect() {
        if (shell.ws && shell.ws.readyState <= 1) return
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${proto}//${location.host}/ws/v1/python`
        console.log('[ws] connecting', wsUrl)
        const ws = new WebSocket(wsUrl)
        shell.ws = ws
        ws.onopen = () => {
          console.log('[ws] open', wsUrl)
          shell.wsOpen.value = true
        }
        ws.onerror = (ev) => {
          console.error('[ws] error', ev)
        }
        ws.onclose = (ev) => {
          console.warn('[ws] close', 'code=', ev.code, 'reason=', ev.reason, 'clean=', ev.wasClean)
          shell.wsOpen.value = false
        }
        ws.onmessage = (ev) => {
          console.log('[ws] recv', ev.data)
          try {
            const msg = JSON.parse(ev.data)
            if (msg.method === 'output') shell.output.value.push({ value: msg.value })
            else if (msg.method === 'finish') shell.running.value = false
            else if (msg.method === 'restarted') shell.restarting.value = false
            else if (msg.method === 'gotoLine') shell.lastLineno.value = msg.value
          } catch (e) { /* non-json frames */ }
        }
        return ws
      }

      function shellRun(code) {
        if (!shell.ws || shell.ws.readyState !== 1) shellConnect()
        shell.running.value = true
        shell.output.value = []
        const payload = JSON.stringify({ method: 'input', value: code })
        console.log('[ws] send', payload)
        shell.ws.send(payload)
      }

      function shellInterrupt() {
        if (shell.ws && shell.ws.readyState === 1) {
          console.log('[ws] send', 'keyboardInterrupt')
          shell.ws.send(JSON.stringify({ method: 'keyboardInterrupt' }))
        }
      }

      function shellRestart() {
        if (shell.ws && shell.ws.readyState === 1) {
          shell.restarting.value = true
          console.log('[ws] send', 'restartKernel')
          shell.ws.send(JSON.stringify({ method: 'restartKernel' }))
        }
      }

      const ElMessage = window.ElementPlus.ElMessage

      async function doConnect() {
        try {
          device.connecting.value = true
          const body = new URLSearchParams({
            platform: device.platform.value,
            deviceUrl: device.serial.value,
          })
          const data = await fetch('/api/v1/connect', { method: 'POST', body }).then(r => r.json())
          if (!data.success) throw new Error(data.description || 'connect failed')
          device.deviceId.value = data.deviceId
          ElMessage.success('Connected: ' + data.deviceId)
          shellConnect()
          shellRun(C.genPreloadCode(data.deviceId))
          if (editor.code.value === '') setCode(C.genClearCode())
        } catch (e) {
          ElMessage.error('Connect failed: ' + e.message)
        } finally {
          device.connecting.value = false
        }
      }

      async function dumpHierarchy() {
        if (!device.deviceId.value) return ElMessage.warning('Connect first')
        try {
          device.loading.value = true
          const id = encodeURIComponent(device.deviceId.value)
          const v2 = await fetch(`/api/v2/devices/${id}/hierarchy`).then(r => r.json())
          device.hierarchy.value = v2
          hierarchyTree.value = v2.jsonHierarchy ? [v2.jsonHierarchy] : []
          const shot = await fetch(`/api/v1/devices/${id}/screenshot`).then(r => r.json())
          screenImg.value = 'data:image/jpeg;base64,' + shot.data
          localStorage.setItem('screenshotBase64', shot.data)
        } catch (e) {
          ElMessage.error('Dump failed: ' + e.message)
        } finally {
          device.loading.value = false
        }
      }

      function treeLabel(n) {
        if (!n) return ''
        return n.text || n.resourceId || n.description || n._type || n.name || '(node)'
      }

      function onNodeClick(data) {
        if (!data.rect) return
        selectedNode.value = data
        editor.generatedCode.value = C.genSelectorDisplay(data, editor.tapMode.value)
      }

      async function doTap() {
        if (!selectedNode.value) return
        let code = editor.generatedCode.value || C.genTouchNode(selectedNode.value)
        if (editor.tapMode.value === 'template' && selectedNode.value.rect) {
          const r = selectedNode.value.rect
          try {
            const resp = await fetch('/api/v1/template', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                screenshot: localStorage.getItem('screenshotBase64') || '',
                bounds: [r.x, r.y, r.x + r.width, r.y + r.height],
              }),
            }).then(r => r.json())
            if (resp.success) code = C.genTemplateTap(resp.path)
          } catch (e) { ElMessage.error('Template crop failed: ' + e.message) }
        }
        if (!code) return
        setCode(code)
        shellRun(code)
      }

      function setCode(code) {
        editor.code.value = code
        if (monacoEditor && monacoEditor.getValue() !== code) monacoEditor.setValue(code)
      }

      function editorCode() { return monacoEditor ? monacoEditor.getValue() : editor.code.value }

      function runCode() { const c = editorCode(); if (c) shellRun(c) }
      function runSelected() {
        if (!monacoEditor) return runCode()
        const sel = monacoEditor.getModel().getValueInRange(monacoEditor.getSelection())
        shellRun(sel || monacoEditor.getValue())
      }
      function runCurrentLine() {
        if (!monacoEditor) return runCode()
        const line = monacoEditor.getPosition().lineNumber
        shellRun(monacoEditor.getModel().getLineContent(line))
      }

      // ---------- Monaco (AMD) ----------
      function initMonaco() {
        return new Promise((resolve) => {
          require.config({ paths: { vs: '/static/vendor/monaco/vs' } })
          require(['vs/editor/editor.main'], function (monaco) {
            monacoEditor = monaco.editor.create(codeContainer.value, {
              value: editor.code.value || C.genClearCode(),
              language: 'python',
              theme: 'vs-dark',
              automaticLayout: true,
              minimap: { enabled: false },
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
            })
            monacoEditor.onDidChangeModelContent(() => { editor.code.value = monacoEditor.getValue() })
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
                  suggestions: C.ANDROID_COMPLETIONS.map(c => ({
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
            resolve()
          })
        })
      }

      watch(shell.lastLineno, (n) => {
        if (monacoEditor && n != null) {
          monacoEditor.revealLineInCenter(n)
          monacoEditor.setPosition({ lineNumber: n, column: 1 })
        }
      })

      watch(rightTab, () => {
        nextTick(() => { if (monacoEditor) monacoEditor.layout() })
      })

      onMounted(async () => {
        fetchVersion()
        await nextTick()
        const main = getMainElement()
        if (main) {
          const rect = main.getBoundingClientRect()
          if (rect.width) screenPaneWidth.value = clampSplitRatio(loadSplitRatio(), rect).toFixed(2) + '%'
        }
        await initMonaco()
        window.addEventListener('resize', fitScreen)
        if (window.ResizeObserver && screenAreaEl.value) {
          new ResizeObserver(fitScreen).observe(screenAreaEl.value)
        }
      })
      onBeforeUnmount(stopSplitResize)

      return {
        version, device, shell, editor, screenImg, selectedNode, selectedInfo,
        hierarchyTree, codeContainer, treeLabel, screenAreaEl, screenImgEl,
        screenPaneWidth, splitterActive, frameStyle, rightTab,
        doConnect, dumpHierarchy, onNodeClick, doTap, fitScreen, startSplitResize,
        runCode, runSelected, runCurrentLine, shellInterrupt, shellRestart,
        genClearCode: C.genClearCode,
      }
    },
    template: `
      <el-container class="layout">
        <el-header class="header">
          <span class="brand">WEditor <small>{{ version }}</small></span>
        </el-header>

        <el-container class="main">
          <el-aside :width="screenPaneWidth" class="pane screen-pane">
            <div class="screen-toolbar">
              <el-select v-model="device.platform.value" size="small" style="width: 128px">
                <el-option label="Android AirTest" value="Android" />
                <el-option label="Android ADB" value="AndroidADB" />
                <el-option label="iOS" value="iOS" />
              </el-select>
              <el-input v-model="device.serial.value" size="small" placeholder="device url" style="width: 150px" />
              <el-button size="small" type="primary" :loading="device.connecting.value" @click="doConnect">Connect</el-button>
              <el-button size="small" :loading="device.loading.value" @click="dumpHierarchy">Dump</el-button>
              <span v-if="device.deviceId.value" class="devid">{{ device.deviceId.value }}</span>
            </div>
            <div class="panel-title">Screen</div>
            <div class="screen-area" ref="screenAreaEl">
              <div v-if="screenImg" class="screen-frame" :style="frameStyle">
                <img ref="screenImgEl" :src="screenImg" class="screen-img" @load="fitScreen" />
              </div>
              <div v-else class="placeholder">No screenshot. Connect &amp; Dump.</div>
            </div>
          </el-aside>

          <div
            class="splitter"
            :class="{ active: splitterActive }"
            title="Drag to resize"
            @mousedown="startSplitResize"
          ></div>

          <el-aside width="auto" class="pane code-pane">
            <div class="code-workspace">
              <el-tabs v-model="rightTab" class="right-tabs">
                <el-tab-pane label="Coding" name="coding">
                  <div class="panel-title">
                    Coding
                    <el-radio-group v-model="editor.tapMode.value" size="small">
                      <el-radio-button value="coordinate">坐标</el-radio-button>
                      <el-radio-button value="template">模板</el-radio-button>
                    </el-radio-group>
                    <el-button size="small" type="primary" @click="runCode">Run</el-button>
                    <el-button size="small" @click="runSelected">Sel</el-button>
                    <el-button size="small" @click="runCurrentLine">Line</el-button>
                    <el-button size="small" type="warning" :disabled="!shell.running.value" @click="shellInterrupt">Stop</el-button>
                    <el-button size="small" :loading="shell.restarting.value" @click="shellRestart">Restart</el-button>
                  </div>
                  <div ref="codeContainer" class="editor-container"></div>
                </el-tab-pane>
                <el-tab-pane label="Hierarchy" name="hierarchy">
                  <el-tree :data="hierarchyTree" node-key="_id" default-expand-all
                    :props="{ children: 'children', label: (d) => treeLabel(d) }"
                    @node-click="onNodeClick" />
                  <div class="selected-pane">
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
                      <el-input size="small" :model-value="editor.generatedCode.value" readonly />
                    </div>
                  </div>
                </el-tab-pane>
              </el-tabs>
              <div class="console-panel">
                <div class="panel-title">Console</div>
                <pre class="console">{{ shell.output.value.map(o => o.value).join('') }}</pre>
              </div>
            </div>
          </el-aside>
        </el-container>
      </el-container>
    `,
  }).use(window.ElementPlus).mount('#app')
})()
