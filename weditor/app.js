/* WEditor frontend - Vue 3 global build, no bundler.
 * Replaces the former Vue3 SFC + Pinia app with a single script-tag driven file. */
(function () {
  'use strict'

  const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue
  const C = window.Codegen
  const SPLIT_RATIO_KEY = 'weditor.splitRatio'
  const TOOLBAR_POS_KEY = 'weditor.toolbarPos'

  function loadSplitRatio() {
    const saved = Number.parseFloat(localStorage.getItem(SPLIT_RATIO_KEY))
    return Number.isFinite(saved) && saved >= 5 && saved <= 95 ? saved : 50
  }

  function loadToolbarPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(TOOLBAR_POS_KEY) || 'null')
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        && saved.x >= 0 && saved.y >= 0) {
        return { x: Math.round(saved.x), y: Math.round(saved.y) }
      }
    } catch (e) {}
    return {
      x: Math.round(window.innerWidth * 0.3),
      y: Math.round(window.innerHeight * 0.3),
    }
  }

  function saveToolbarPosition(pos) {
    try {
      localStorage.setItem(TOOLBAR_POS_KEY, JSON.stringify(pos))
    } catch (e) {}
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
    pending: [],
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
      const deviceCoordinateSize = ref(null)
      const screenshotSize = ref(null)
      const displaySize = ref(null)
      const zoomPercent = ref(0)
      const cursorPoint = ref(null)
      const coordTipStyle = ref({})
      const frameStyle = ref({})
      const rightTab = ref('coding')
      const toolbarEl = ref(null)
      const toolbarPos = ref(loadToolbarPosition())
      const toolbarDragging = ref(false)
      const screenshotLoading = ref(false)
      const toolbarStyle = computed(() => ({
        transform: `translate3d(${toolbarPos.value.x}px, ${toolbarPos.value.y}px, 0)`,
      }))
      let monacoEditor = null
      let splitting = false
      let screenGesture = null
      let toolbarDrag = null
      let suppressToolbarClick = false
      let hasConnectedOnce = false

      const selectedInfo = computed(() => selectedNode.value || {})

      function formatSize(size) {
        return size ? `${size.width} × ${size.height}` : '-'
      }

      const screenInfoText = computed(() => {
        return screenshotSize.value ? '截图 ' + formatSize(screenshotSize.value) : '-'
      })
      const displaySizeText = computed(() => formatSize(displaySize.value))
      const cursorText = computed(() => cursorPoint.value
        ? `${cursorPoint.value.x}, ${cursorPoint.value.y}`
        : '-')

      function fitScreen() {
        const area = screenAreaEl.value
        const img = screenImgEl.value
        if (!area || !img || !img.naturalWidth || !img.naturalHeight) return
        screenshotSize.value = { width: img.naturalWidth, height: img.naturalHeight }
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
        const rw = Math.round(w)
        const rh = Math.round(h)
        frameStyle.value = { width: rw + 'px', height: rh + 'px' }
        displaySize.value = { width: rw, height: rh }
        zoomPercent.value = Math.round((w / img.naturalWidth) * 100)
      }

      function parseWindowSize(value) {
        const parts = String(value || '').split(',').map(v => Number(v.trim()))
        if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
        if (parts[0] <= 0 || parts[1] <= 0) return null
        return { width: parts[0], height: parts[1] }
      }

      async function refreshDeviceSize() {
        const id = encodeURIComponent(device.deviceId.value)
        const v2 = await fetch(`/api/v2/devices/${id}/hierarchy`).then(r => r.json())
        deviceCoordinateSize.value = parseWindowSize(v2.windowSize)
      }

      function toDevicePoint(e) {
        const img = screenImgEl.value
        if (!img || !img.naturalWidth || !img.naturalHeight) return null
        const rect = img.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        const size = deviceCoordinateSize.value || { width: img.naturalWidth, height: img.naturalHeight }
        const x = Math.round((e.clientX - rect.left) * size.width / rect.width)
        const y = Math.round((e.clientY - rect.top) * size.height / rect.height)
        return {
          x: Math.max(0, Math.min(x, size.width - 1)),
          y: Math.max(0, Math.min(y, size.height - 1)),
        }
      }

      function updateCursor(e) {
        const img = screenImgEl.value
        const point = toDevicePoint(e)
        if (!img || !point) return
        cursorPoint.value = point
        const rect = img.getBoundingClientRect()
        const left = Math.min(Math.max(e.clientX - rect.left + 10, 4), Math.max(4, rect.width - 72))
        const top = Math.min(Math.max(e.clientY - rect.top - 26, 4), Math.max(4, rect.height - 24))
        coordTipStyle.value = { left: left + 'px', top: top + 'px' }
      }

      function clearCursor() {
        cursorPoint.value = null
      }

      async function runScreenGesture(payload) {
        if (!device.deviceId.value) return
        const id = encodeURIComponent(device.deviceId.value)
        try {
          const response = await fetch(`/api/v1/devices/${id}/gesture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          let result = null
          try {
            result = await response.json()
          } catch (e) {
            throw new Error(`Invalid gesture response (HTTP ${response.status})`)
          }
          if (!response.ok || !result.success) {
            throw new Error(result.description || `HTTP ${response.status}`)
          }
        } catch (e) {
          ElMessage.error('Screen gesture failed: ' + (e && e.message ? e.message : String(e)))
        }
      }

      function removeGestureListeners() {
        document.removeEventListener('mousemove', onGestureMove)
        document.removeEventListener('mouseup', onGestureUp)
      }

      function onGestureMove(e) {
        if (screenGesture) updateCursor(e)
      }

      function onGestureUp(e) {
        if (!screenGesture) return
        removeGestureListeners()
        const start = screenGesture.start
        const end = toDevicePoint(e) || start
        screenGesture = null
        if (e.target !== screenImgEl.value) clearCursor()
        const dx = end.x - start.x
        const dy = end.y - start.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= 16) {
          runScreenGesture({ action: 'tap', x: start.x, y: start.y })
        } else {
          runScreenGesture({
            action: 'swipe',
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            duration: 0.5,
          })
        }
      }

      function onScreenMouseDown(e) {
        if (e.button !== 0) return
        const point = toDevicePoint(e)
        if (!point || !device.deviceId.value) return
        e.preventDefault()
        screenGesture = { start: point }
        updateCursor(e)
        removeGestureListeners()
        document.addEventListener('mousemove', onGestureMove)
        document.addEventListener('mouseup', onGestureUp)
      }

      function onScreenMouseMove(e) {
        if (!screenGesture) updateCursor(e)
      }

      function onScreenMouseLeave() {
        if (!screenGesture) clearCursor()
      }

      async function refreshScreenshot() {
        if (!device.deviceId.value) throw new Error('device not connected')
        const id = encodeURIComponent(device.deviceId.value)
        const response = await fetch(`/api/v1/devices/${id}/screenshot`)
        let shot = null
        try {
          shot = await response.json()
        } catch (e) {
          throw new Error(`Invalid screenshot response (HTTP ${response.status})`)
        }
        if (!response.ok) throw new Error(shot.description || `HTTP ${response.status}`)
        if (!shot || !shot.data) throw new Error('screenshot data missing')
        clearCursor()
        screenImg.value = 'data:image/' + (shot.type || 'jpeg') + ';base64,' + shot.data
        try {
          localStorage.setItem('screenshotBase64', shot.data)
        } catch (e) {
          console.warn('[screen] cache screenshot failed', e)
        }
        await nextTick()
        fitScreen()
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

      function clampToolbarPosition(x, y) {
        const el = toolbarEl.value
        const maxX = Math.max(0, window.innerWidth - (el ? el.offsetWidth : 0))
        const maxY = Math.max(0, window.innerHeight - (el ? el.offsetHeight : 0))
        return {
          x: Math.round(Math.min(Math.max(x, 0), maxX)),
          y: Math.round(Math.min(Math.max(y, 0), maxY)),
        }
      }

      function onToolbarDragMove(e) {
        if (!toolbarDrag) return
        const dx = e.clientX - toolbarDrag.startX
        const dy = e.clientY - toolbarDrag.startY
        if (!toolbarDrag.moved && dx * dx + dy * dy < 16) return
        toolbarDrag.moved = true
        toolbarPos.value = clampToolbarPosition(
          e.clientX - toolbarDrag.offsetX,
          e.clientY - toolbarDrag.offsetY,
        )
      }

      function stopToolbarDrag() {
        if (!toolbarDrag) return
        const moved = toolbarDrag.moved
        toolbarDrag = null
        toolbarDragging.value = false
        if (moved) {
          saveToolbarPosition(toolbarPos.value)
          suppressToolbarClick = true
          window.setTimeout(() => { suppressToolbarClick = false }, 0)
        }
        document.body.classList.remove('toolbar-dragging')
        document.removeEventListener('mousemove', onToolbarDragMove)
        document.removeEventListener('mouseup', stopToolbarDrag)
        window.removeEventListener('blur', stopToolbarDrag)
      }

      function startToolbarDrag(e) {
        if (e.button !== 0 || toolbarDrag) return
        const el = toolbarEl.value
        if (!el) return
        e.preventDefault()
        const rect = el.getBoundingClientRect()
        toolbarDrag = {
          startX: e.clientX,
          startY: e.clientY,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          moved: false,
        }
        toolbarDragging.value = true
        document.body.classList.add('toolbar-dragging')
        document.addEventListener('mousemove', onToolbarDragMove)
        document.addEventListener('mouseup', stopToolbarDrag)
        window.addEventListener('blur', stopToolbarDrag)
      }

      function onToolbarWindowResize() {
        toolbarPos.value = clampToolbarPosition(toolbarPos.value.x, toolbarPos.value.y)
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
          flushPendingShell()
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

      function flushPendingShell() {
        if (!shell.ws || shell.ws.readyState !== 1) return
        while (shell.pending.length) {
          const code = shell.pending.shift()
          const payload = JSON.stringify({ method: 'input', value: code })
          console.log('[ws] send queued', payload)
          shell.ws.send(payload)
        }
      }

      function shellRun(code) {
        if (!code) return
        const ready = shell.ws && shell.ws.readyState === 1
        if (!shell.pending.length) shell.output.value = []
        shell.running.value = true
        if (!ready) {
          shellConnect()
          shell.pending.push(code)
          console.log('[ws] queued', code)
          return
        }
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

      async function refreshScreenshotFromToolbar() {
        if (suppressToolbarClick || screenshotLoading.value) return
        if (!device.deviceId.value) {
          ElMessage.warning('Connect first')
          return
        }
        screenshotLoading.value = true
        try {
          await refreshScreenshot()
          ElMessage.success('Screenshot refreshed')
        } catch (e) {
          ElMessage.error('Refresh screenshot failed: ' + (e && e.message ? e.message : String(e)))
        } finally {
          screenshotLoading.value = false
        }
      }

      async function doConnect() {
        try {
          device.connecting.value = true
          const body = new URLSearchParams({
            platform: device.platform.value,
            deviceUrl: device.serial.value,
          })
          const data = await fetch('/api/v1/connect', { method: 'POST', body }).then(r => r.json())
          if (!data.success) throw new Error(data.description || 'connect failed')
          const isFirstConnection = !hasConnectedOnce
          hasConnectedOnce = true
          device.deviceId.value = data.deviceId
          screenImg.value = null
          deviceCoordinateSize.value = null
          screenshotSize.value = null
          displaySize.value = null
          zoomPercent.value = 0
          ElMessage.success('Connected: ' + data.deviceId)
          shellConnect()
          if (isFirstConnection) {
            console.info('[connect] first connection: skip hierarchy request')
          } else {
            try {
              await refreshDeviceSize()
            } catch (e) {
              console.warn('[screen] device size unavailable', e)
            }
          }
          try {
            await refreshScreenshot()
          } catch (e) {
            ElMessage.warning('Screenshot failed: ' + e.message)
          }
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
          deviceCoordinateSize.value = parseWindowSize(v2.windowSize)
          hierarchyTree.value = v2.jsonHierarchy ? [v2.jsonHierarchy] : []
          await refreshScreenshot()
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
        toolbarPos.value = clampToolbarPosition(toolbarPos.value.x, toolbarPos.value.y)
        const main = getMainElement()
        if (main) {
          const rect = main.getBoundingClientRect()
          if (rect.width) screenPaneWidth.value = clampSplitRatio(loadSplitRatio(), rect).toFixed(2) + '%'
        }
        await initMonaco()
        window.addEventListener('resize', fitScreen)
        window.addEventListener('resize', onToolbarWindowResize)
        if (window.ResizeObserver && screenAreaEl.value) {
          new ResizeObserver(fitScreen).observe(screenAreaEl.value)
        }
      })
      onBeforeUnmount(() => {
        stopSplitResize()
        stopToolbarDrag()
        removeGestureListeners()
        window.removeEventListener('resize', fitScreen)
        window.removeEventListener('resize', onToolbarWindowResize)
      })

      return {
        version, device, shell, editor, screenImg, selectedNode, selectedInfo,
        hierarchyTree, codeContainer, treeLabel, screenAreaEl, screenImgEl,
        screenPaneWidth, splitterActive, frameStyle, rightTab,
        toolbarEl, toolbarStyle, toolbarDragging, screenshotLoading,
        screenInfoText, displaySizeText, zoomPercent, cursorText,
        cursorPoint, coordTipStyle,
        doConnect, dumpHierarchy, onNodeClick, doTap, fitScreen, startSplitResize,
        startToolbarDrag, refreshScreenshotFromToolbar,
        onScreenMouseDown, onScreenMouseMove, onScreenMouseLeave,
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
            <div class="panel-title">
              Screen
              <div class="screen-meta">
                <span>屏幕信息：{{ screenInfoText }}</span>
                <span>大小：{{ displaySizeText }}</span>
                <span>当前缩放：{{ zoomPercent }}%</span>
                <span>坐标：{{ cursorText }}</span>
              </div>
            </div>
            <div class="screen-area" ref="screenAreaEl">
              <div v-if="screenImg" class="screen-frame" :style="frameStyle">
                <img
                  ref="screenImgEl"
                  :src="screenImg"
                  class="screen-img"
                  draggable="false"
                  @load="fitScreen"
                  @mousedown="onScreenMouseDown"
                  @mousemove="onScreenMouseMove"
                  @mouseleave="onScreenMouseLeave"
                  @contextmenu.prevent
                />
                <div v-if="cursorPoint" class="coord-tip" :style="coordTipStyle">
                  {{ cursorPoint.x }}, {{ cursorPoint.y }}
                </div>
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

        <div
          ref="toolbarEl"
          class="floating-toolbar"
          :class="{ dragging: toolbarDragging }"
          :style="toolbarStyle"
          title="拖拽移动工具栏"
          @mousedown="startToolbarDrag"
        >
          <el-button
            class="toolbar-refresh"
            size="small"
            circle
            aria-label="刷新截图"
            :title="screenshotLoading ? '截图中...' : '刷新截图'"
            :loading="screenshotLoading"
            @click="refreshScreenshotFromToolbar"
          >
            <svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-8 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
            </svg>
          </el-button>
        </div>
      </el-container>
    `,
  }).use(window.ElementPlus).mount('#app')
})()
