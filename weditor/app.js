/* WEditor frontend - Vue 3 global build, no bundler.
 * Replaces the former Vue3 SFC + Pinia app with a single script-tag driven file. */
(function () {
  'use strict'

  const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue
  const C = window.Codegen
  const SPLIT_RATIO_KEY = 'weditor.splitRatio'
  const CONSOLE_HEIGHT_KEY = 'weditor.consoleHeight'
  const TOOLBAR_POS_KEY = 'weditor.toolbarPos'
  const SCREEN_MODE_KEY = 'weditor.screenMode'
  const ACTIONS_COLLAPSED_KEY = 'weditor.actionsCollapsed'
  const ACTION_GROUP_LABELS = { action: '交互操作', assert: '等待与断言', utility: '辅助工具' }
  const CONSOLE_LEVELS_KEY = 'weditor.consoleLevels'
  const LOG_LEVELS = [
    { key: 'debug', label: 'DEBUG' },
    { key: 'info', label: 'INFO' },
    { key: 'warning', label: 'WARNING' },
    { key: 'error', label: 'ERROR' },
  ]
  const LOG_LEVEL_ALIASES = {
    debug: 'debug', trace: 'debug',
    info: 'info', notice: 'info',
    warn: 'warning', warning: 'warning',
    error: 'error', err: 'error', critical: 'error', fatal: 'error',
  }

  function defaultConsoleLevels() {
    return LOG_LEVELS.map(l => l.key)
  }

  function loadConsoleLevels() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONSOLE_LEVELS_KEY) || 'null')
      if (Array.isArray(saved)) return saved.filter(k => LOG_LEVELS.some(l => l.key === k))
    } catch (e) {}
    return defaultConsoleLevels()
  }

  function saveConsoleLevels(levels) {
    try { localStorage.setItem(CONSOLE_LEVELS_KEY, JSON.stringify(levels)) } catch (e) {}
  }

  function normalizeLogLevel(level) {
    return LOG_LEVEL_ALIASES[String(level || '').toLowerCase()] || null
  }

  function inferLogLevel(text) {
    const s = String(text || '')
    if (/traceback \(most recent call last\)|\[(?:critical|fatal|error)\]/i.test(s)) return 'error'
    if (/\[(?:warn|warning)\]/i.test(s)) return 'warning'
    if (/\[debug\]/i.test(s)) return 'debug'
    return 'info'
  }

  function resolveLogLevel(level, text) {
    const normalized = normalizeLogLevel(level)
    // stdout defaults to info; explicit markers in the text should still win
    if (normalized === 'info') return inferLogLevel(text)
    return normalized || inferLogLevel(text)
  }

  const CODING_ACTIONS = [
    {
      id: 'touch', label: 'touch', name: '坐标点击', group: 'action',
      description: '在指定坐标执行一次点击；模板模式下框选图像后生成 touch(Template(...))。',
      code: 'touch((x, y))',
      templateCode: 'touch(Template("tpl.png"))',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10"/><path d="M12 10V4.5a1.5 1.5 0 0 1 3 0V10"/><path d="M15 10V6a1.5 1.5 0 0 1 3 0v8c0 4.2-2.6 7-6.5 7S6 18.4 6 14v-3a1.5 1.5 0 0 1 3 0v2"/></svg>',
    },
    {
      id: 'wait', label: 'wait', name: '等待图像', group: 'assert',
      description: '等待图像模板出现，超时时间为 10 秒。',
      code: 'wait(Template("tpl.png"), timeout=10)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h5"/><path d="M12 2.5v2"/><circle cx="12" cy="13" r="8"/><path d="M12 9v4.2l2.8 1.8"/></svg>',
    },
    {
      id: 'swipe', label: 'swipe', name: '滑动', group: 'action',
      description: '从起点滑动到终点，duration 为持续时间（秒）。',
      code: 'swipe((x1, y1), (x2, y2), duration=0.5)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 21v-8a2 2 0 0 1 4 0v8"/><path d="M9.5 13V6.5a2 2 0 0 1 4 0V13"/><path d="M5.5 10V4.5"/><path d="m3.5 6.5 2-2 2 2"/><path d="M16 13V8"/><path d="m14 10 2-2 2 2"/></svg>',
    },
    {
      id: 'exists', label: 'exists', name: '图像存在', group: 'assert',
      description: '判断图像模板是否出现在当前屏幕；框选范围后自动填充模板路径。',
      code: 'exists(Template("tpl.png"))',
      templateCode: 'exists(Template("tpl.png"))',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="m7.5 10.5 2 2 4-4"/></svg>',
    },
    {
      id: 'text', label: 'text', name: '输入文本', group: 'action',
      description: '向当前焦点输入英文文本；中文请改用 input_text。',
      code: 'text("hello")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6.5 9.5h7M10 9.5V16M15 9.5h3.5M16.75 9.5V16M15 16h3.5"/></svg>',
    },
    {
      id: 'keyevent', label: 'keyevent', name: '系统按键', group: 'action',
      description: '发送系统按键，例如 HOME、BACK、POWER。',
      code: 'keyevent("HOME")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 13.5h.01M17 13.5h.01M10 13.5h4"/></svg>',
    },
    {
      id: 'snapshot', label: 'snapshot', name: '保存截图', group: 'utility',
      description: '保存当前设备屏幕到文件，便于后续 Template 匹配。',
      code: 'snapshot("screen.png")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h2l1.5-2.5h5L16 6h2a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    },
    {
      id: 'sleep', label: 'sleep', name: '休眠等待', group: 'assert',
      description: '暂停脚本执行指定的秒数。',
      code: 'sleep(1)',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>',
    },
    {
      id: 'log', label: 'log', name: '打印日志', group: 'utility',
      description: '向控制台输出一条日志；Run 后内容显示在下方 Console。',
      code: 'log("message")',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4v-4H5.5A1.5 1.5 0 0 1 4 14.5z"/><path d="M8 9h8M8 12h5"/></svg>',
    },
  ]

  function loadScreenMode() {
    return localStorage.getItem(SCREEN_MODE_KEY) === 'minicap' ? 'minicap' : 'screenshot'
  }

  function saveScreenMode(mode) {
    try {
      localStorage.setItem(SCREEN_MODE_KEY, mode)
    } catch (e) {}
  }

  function loadSplitRatio() {
    const saved = Number.parseFloat(localStorage.getItem(SPLIT_RATIO_KEY))
    return Number.isFinite(saved) && saved >= 5 && saved <= 95 ? saved : 50
  }

  function loadConsoleHeight() {
    const saved = Number.parseFloat(localStorage.getItem(CONSOLE_HEIGHT_KEY))
    return Number.isFinite(saved) && saved >= 80 && saved <= 2000 ? saved : 180
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
      const consoleHeight = ref(loadConsoleHeight() + 'px')
      const consoleSplitterActive = ref(false)
      const consoleLevels = ref(loadConsoleLevels())
      const visibleConsoleOutput = computed(() =>
        shell.output.value.filter(o => consoleLevels.value.includes(o.level)))
      watch(consoleLevels, v => saveConsoleLevels(v), { deep: true })
      const deviceCoordinateSize = ref(null)
      const screenshotSize = ref(null)
      const displaySize = ref(null)
      const zoomPercent = ref(0)
      const cursorPoint = ref(null)
      const coordTipStyle = ref({})
      const frameStyle = ref({})
      const templateRect = ref(null)
      const rightTab = ref('coding')
      const codingMode = ref(false) // false=操作, true=编程
      const codeWorkspaceEl = ref(null)
      const workspaceWidth = ref(0)
      const actionsCollapsed = ref(localStorage.getItem(ACTIONS_COLLAPSED_KEY) === '1')
      const actionsCompact = computed(() => actionsCollapsed.value
        || (workspaceWidth.value > 0 && workspaceWidth.value < 560))
      const activeSnippet = ref('')
      const pendingCoordHint = ref(false)
      const coordHintText = ref('')
      const pendingTemplateFill = ref(false)
      const templateHintText = ref('')
      let coordFillRange = null
      let coordFillPlan = null
      let coordFillEditing = false
      let templateFillRange = null
      let templateBounds = null
      let templateFillAction = null
      let suppressTemplateClear = false
      let workspaceObserver = null
      function clearCoordFill() {
        coordFillRange = null
        coordFillPlan = null
        pendingCoordHint.value = false
        coordHintText.value = ''
      }
      function clearTemplateFill() {
        templateFillRange = null
        templateBounds = null
        templateFillAction = null
        lastTemplateTap = null
        pendingTemplateFill.value = false
        templateHintText.value = ''
      }
      watch(actionsCollapsed, (v) => {
        try { localStorage.setItem(ACTIONS_COLLAPSED_KEY, v ? '1' : '0') } catch (e) {}
        nextTick(() => { if (monacoEditor) monacoEditor.layout() })
      })
      const templateAssets = ref([])
      const templateAssetsLoading = ref(false)
      const MODE_LABELS = { operate: '操作', program: '编程', template: '模板' }
      function modeFrom(coding, tap) {
        return !coding ? 'operate' : (tap === 'template' ? 'template' : 'program')
      }
      const activeMode = computed(() => modeFrom(codingMode.value, editor.tapMode.value))
      const toolbarEl = ref(null)
      const toolbarPos = ref(loadToolbarPosition())
      const toolbarDragging = ref(false)
      const screenshotLoading = ref(false)
      const screenMode = ref(loadScreenMode())
      const screenWebSocketUrl = ref(null)
      const minicapConnecting = ref(false)
      const toolbarStyle = computed(() => ({
        transform: `translate3d(${toolbarPos.value.x}px, ${toolbarPos.value.y}px, 0)`,
      }))
      const screenModeLabel = computed(() => screenMode.value === 'minicap' ? 'minicap' : '截图')
      const screenModeTitle = computed(() => screenMode.value === 'minicap'
        ? '当前：minicap 实时投屏，点击切换到截图'
        : '当前：截图投屏，点击切换到 minicap')
      let monacoEditor = null
      const currentFileName = ref('未命名.py')
      const fileDirty = ref(false)
      const fileTreeData = ref([])
      const selectedFileNode = ref(null)
      const currentFilePath = ref('')
      const workspaceLoading = ref(false)
      const projectPath = ref('')
      const projectLabel = computed(() => {
        const parts = projectPath.value.split(/[\\/]/).filter(Boolean)
        return parts.length ? parts[parts.length - 1] : 'Explorer'
      })
      const fileTabLabel = computed(() =>
        (currentFileName.value || '未命名.py') + (fileDirty.value ? ' *' : ''))
      let suppressFileDirty = false
      let directoryHandle = null
      const fileHandles = new Map()
      function markFileDirty() {
        if (!suppressFileDirty) fileDirty.value = true
      }
      let splitting = false
      let consoleResizing = false
      let screenGesture = null
      let lastProgramTap = null
      let lastTemplateTap = null
      const DOUBLE_TAP_MS = 400
      const DOUBLE_TAP_DISTANCE = 8
      let toolbarDrag = null
      let suppressToolbarClick = false
      let hasConnectedOnce = false
      let screenWs = null
      let minicapObjectUrl = null
      let minicapRetryTimer = null

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

      function logInteraction(tag, message, detail) {
        if (detail === undefined) console.log(`[${tag}] ${message}`)
        else console.log(`[${tag}] ${message}`, detail)
      }

      function toFramePoint(e) {
        const img = screenImgEl.value
        if (!img) return null
        const rect = img.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        return {
          x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
          y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
        }
      }

      function updateTemplateSelection(e, startFrame) {
        const endFrame = toFramePoint(e)
        if (!endFrame || !startFrame) return null
        const left = Math.round(Math.min(startFrame.x, endFrame.x))
        const top = Math.round(Math.min(startFrame.y, endFrame.y))
        const width = Math.max(2, Math.round(Math.abs(endFrame.x - startFrame.x)))
        const height = Math.max(2, Math.round(Math.abs(endFrame.y - startFrame.y)))
        templateRect.value = {
          left: left + 'px',
          top: top + 'px',
          width: width + 'px',
          height: height + 'px',
        }
        return templateRect.value
      }

      watch(activeMode, (next, prev) => {
        logInteraction('模式切换', `${MODE_LABELS[prev]} → ${MODE_LABELS[next]}`, { mode: next })
        screenGesture = null
        lastProgramTap = null
        clearCoordFill()
        if (suppressTemplateClear) suppressTemplateClear = false
        else clearTemplateFill()
        removeGestureListeners()
        clearCursor()
        templateRect.value = null
        logInteraction('模板模式', '边框渲染（清除：等待左键拖拽绘制）')
      })

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
        if (!screenGesture) return
        if (screenGesture.mode === 'template') updateTemplateSelection(e, screenGesture.startFrame)
        else updateCursor(e)
      }

      function onGestureUp(e) {
        if (!screenGesture) return
        removeGestureListeners()
        const gesture = screenGesture
        const start = gesture.start
        const end = toDevicePoint(e) || start
        screenGesture = null
        if (e.target !== screenImgEl.value) clearCursor()
        const dx = end.x - start.x
        const dy = end.y - start.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (gesture.mode === 'operate') {
          if (distance <= 16) {
            logInteraction('操作模式', '点击 Screen，下发 tap', { x: start.x, y: start.y })
            runScreenGesture({ action: 'tap', x: start.x, y: start.y })
          } else {
            logInteraction('操作模式', '滑动 Screen，下发 swipe', {
              x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration: 0.5,
            })
            runScreenGesture({
              action: 'swipe',
              x1: start.x,
              y1: start.y,
              x2: end.x,
              y2: end.y,
              duration: 0.5,
            })
          }
          return
        }

        if (gesture.mode === 'program') {
          if (distance > 16) {
            logInteraction('编程模式', '检测到滑动，编程模式仅响应点击（已忽略）', {
              from: start, to: end,
            })
            return
          }
          const now = Date.now()
          const isDoubleTap = lastProgramTap
            && now - lastProgramTap.time <= DOUBLE_TAP_MS
            && Math.hypot(e.clientX - lastProgramTap.x, e.clientY - lastProgramTap.y) <= DOUBLE_TAP_DISTANCE
          if (!isDoubleTap) {
            lastProgramTap = { time: now, x: e.clientX, y: e.clientY }
            logInteraction('编程模式', '等待双击（第二次点击后插入代码）', { x: start.x, y: start.y })
            return
          }
          lastProgramTap = null
          logInteraction('编程模式', '获取坐标', { x: start.x, y: start.y })
          if (coordFillRange && monacoEditor) {
            const plan = coordFillPlan
            const range = coordFillRange
            coordFillRange = null
            const stepIndex = plan ? plan.index : 0
            const total = plan ? plan.ranges.length : 1
            const text = `${start.x}, ${start.y}`
            const model = monacoEditor.getModel()
            const lineNumber = range.startLineNumber
            const delta = text.length - (range.endColumn - range.startColumn)
            if (plan && stepIndex < total - 1) {
              for (let i = stepIndex + 1; i < total; i += 1) {
                plan.ranges[i].startColumn += delta
                plan.ranges[i].endColumn += delta
              }
            }
            coordFillEditing = true
            monacoEditor.pushUndoStop()
            monacoEditor.executeEdits('weditor-coord-fill', [{
              range,
              text,
              forceMoveMarkers: true,
            }])
            monacoEditor.pushUndoStop()
            coordFillEditing = false
            if (plan && stepIndex < total - 1) {
              plan.index += 1
              coordFillRange = plan.ranges[plan.index]
              coordHintText.value = `双击 Screen 填充终点 x2, y2（${plan.index + 1}/${total}）`
              monacoEditor.setSelection(coordFillRange)
              monacoEditor.revealRangeInCenter(coordFillRange)
              monacoEditor.focus()
              ElMessage({ message: coordHintText.value, type: 'info', duration: 3000 })
              logInteraction('编程模式', '双击 Screen 填充起点 x1, y1（1/2）', { x: start.x, y: start.y })
              return
            }
            const maxColumn = model.getLineMaxColumn(lineNumber)
            const indent = (model.getLineContent(lineNumber).match(/^\s*/) || [''])[0]
            monacoEditor.setPosition({ lineNumber, column: maxColumn })
            const edits = []
            let cursorColumn
            if (lineNumber < model.getLineCount()) {
              cursorColumn = ((model.getLineContent(lineNumber + 1).match(/^\s*/) || [''])[0]).length + 1
            } else {
              edits.push({
                range: {
                  startLineNumber: lineNumber,
                  startColumn: maxColumn,
                  endLineNumber: lineNumber,
                  endColumn: maxColumn,
                },
                text: '\n' + indent,
                forceMoveMarkers: true,
              })
              cursorColumn = indent.length + 1
            }
            if (edits.length) {
              coordFillEditing = true
              monacoEditor.pushUndoStop()
              monacoEditor.executeEdits('weditor-coord-newline', edits)
              monacoEditor.pushUndoStop()
              coordFillEditing = false
            }
            monacoEditor.setPosition({ lineNumber: lineNumber + 1, column: cursorColumn })
            monacoEditor.focus()
            activeSnippet.value = plan ? plan.kind : 'touch'
            logInteraction('编程模式', '双击 Screen 填充坐标并换行', {
              x: start.x, y: start.y, text,
              steps: total,
            })
            clearCoordFill()
            return
          }
          const code = C.genTouch(start.x, start.y)
          const inserted = insertAtCursor(code)
          logInteraction('编程模式', '双击插入坐标代码到 Coding 当前位置', {
            code, inserted,
            cursor: monacoEditor ? monacoEditor.getPosition() : null,
          })
          return
        }

        if (gesture.mode === 'template') {
          const hasDrag = Math.abs(end.x - start.x) >= 2 || Math.abs(end.y - start.y) >= 2
          const now = Date.now()
          const isDoubleTap = !hasDrag && lastTemplateTap
            && now - lastTemplateTap.time <= DOUBLE_TAP_MS
            && Math.hypot(e.clientX - lastTemplateTap.x, e.clientY - lastTemplateTap.y) <= DOUBLE_TAP_DISTANCE
          lastTemplateTap = hasDrag ? null : { time: now, x: e.clientX, y: e.clientY }
          if (templateBounds && isDoubleTap) {
            const bounds = templateBounds
            templateBounds = null
            saveTemplateFill(bounds)
            return
          }
          if (hasDrag) {
            const rect = updateTemplateSelection(e, gesture.startFrame)
            logInteraction('模板模式', '框选完成', { deviceStart: start, deviceEnd: end })
            logInteraction('模板模式', '边框渲染（完成）', rect)
            if (pendingTemplateFill.value) {
              templateBounds = [
                Math.min(start.x, end.x),
                Math.min(start.y, end.y),
                Math.max(start.x, end.x),
                Math.max(start.y, end.y),
              ]
              templateHintText.value = '双击 Screen 确认保存模板'
              ElMessage({ message: templateHintText.value, type: 'info', duration: 4000 })
            }
          }
        }
      }

      function onScreenMouseDown(e) {
        if (e.button !== 0) return
        const mode = activeMode.value
        const point = toDevicePoint(e)
        if (!point) return
        if (mode === 'operate' && !device.deviceId.value) return
        e.preventDefault()
        screenGesture = { start: point, mode, startFrame: toFramePoint(e) }
        logInteraction('Screen', '点击', { mode: MODE_LABELS[mode], point })
        if (mode === 'template') {
          logInteraction('模板模式', '开始框选（按住左键拖拽绘制）', screenGesture.startFrame)
        }
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
        document.removeEventListener('mousemove', resizeSplitter)
        document.removeEventListener('mouseup', stopSplitResize)
      }

      function startSplitResize(e) {
        if (splitting || (e.button != null && e.button !== 0)) return
        e.preventDefault()
        splitting = true
        splitterActive.value = true
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', resizeSplitter)
        document.addEventListener('mouseup', stopSplitResize)
      }

      function getWorkspaceElement() {
        return document.querySelector('.code-workspace')
      }

      function clampConsoleHeight(height, rect) {
        const minHeight = 80
        const minTop = 160
        const splitterHeight = 8
        const maxHeight = Math.max(minHeight, rect.height - minTop - splitterHeight)
        return Math.min(Math.max(height, minHeight), maxHeight)
      }

      function onWorkspaceResize() {
        const workspace = getWorkspaceElement()
        if (!workspace) return
        const rect = workspace.getBoundingClientRect()
        if (!rect.height) return
        consoleHeight.value = clampConsoleHeight(loadConsoleHeight(), rect) + 'px'
      }

      function resizeConsoleSplitter(e) {
        const workspace = getWorkspaceElement()
        if (!workspace) return
        const rect = workspace.getBoundingClientRect()
        if (!rect.height) return
        const height = clampConsoleHeight(rect.bottom - e.clientY, rect)
        const rounded = Math.round(height)
        consoleHeight.value = rounded + 'px'
        localStorage.setItem(CONSOLE_HEIGHT_KEY, String(rounded))
        nextTick(() => { if (monacoEditor) monacoEditor.layout() })
      }

      function stopConsoleResize() {
        if (!consoleResizing) return
        consoleResizing = false
        consoleSplitterActive.value = false
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', resizeConsoleSplitter)
        document.removeEventListener('mouseup', stopConsoleResize)
      }

      function startConsoleResize(e) {
        if (consoleResizing || (e.button != null && e.button !== 0)) return
        e.preventDefault()
        consoleResizing = true
        consoleSplitterActive.value = true
        document.body.style.userSelect = 'none'
        document.addEventListener('mousemove', resizeConsoleSplitter)
        document.addEventListener('mouseup', stopConsoleResize)
      }

      function toggleConsoleLevel(key, event) {
        const enabled = new Set(consoleLevels.value)
        if (event.target.checked) enabled.add(key)
        else enabled.delete(key)
        consoleLevels.value = LOG_LEVELS.filter(l => enabled.has(l.key)).map(l => l.key)
      }

      function resetConsoleSettings() {
        consoleLevels.value = defaultConsoleLevels()
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
            if (msg.method === 'output') {
              const level = resolveLogLevel(msg.level, msg.value)
              shell.output.value.push({ value: msg.value, level })
            }
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

      function closeMinicap() {
        if (minicapRetryTimer) {
          window.clearTimeout(minicapRetryTimer)
          minicapRetryTimer = null
        }
        if (screenWs) {
          const ws = screenWs
          screenWs = null
          ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
          try { ws.close() } catch (e) {}
        }
        if (minicapObjectUrl) {
          URL.revokeObjectURL(minicapObjectUrl)
          minicapObjectUrl = null
        }
        minicapConnecting.value = false
      }

      function applyMinicapFrame(data) {
        let blob = null
        if (data instanceof Blob) {
          blob = data
        } else if (data instanceof ArrayBuffer) {
          blob = new Blob([data], { type: 'image/jpeg' })
        } else if (typeof data === 'string') {
          try {
            const msg = JSON.parse(data)
            if (msg.data) {
              const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
              blob = new Blob([bytes], { type: 'image/' + (msg.type || 'jpeg') })
            }
          } catch (e) {
            return
          }
        }
        if (!blob) return
        const nextUrl = URL.createObjectURL(blob)
        const prevUrl = minicapObjectUrl
        minicapObjectUrl = nextUrl
        screenImg.value = nextUrl
        nextTick(() => {
          fitScreen()
          if (prevUrl) URL.revokeObjectURL(prevUrl)
        })
      }

      function connectMinicap() {
        closeMinicap()
        if (!device.deviceId.value) return
        if (!screenWebSocketUrl.value) {
          ElMessage.warning('当前设备未提供 minicap WebSocket 地址')
          return
        }
        let ws
        try {
          ws = new WebSocket(screenWebSocketUrl.value)
        } catch (e) {
          ElMessage.error('minicap 地址无效: ' + e.message)
          return
        }
        ws.binaryType = 'blob'
        screenWs = ws
        minicapConnecting.value = true
        ws.onopen = () => {
          minicapConnecting.value = false
          console.info('[minicap] connected', screenWebSocketUrl.value)
        }
        ws.onmessage = (ev) => applyMinicapFrame(ev.data)
        ws.onerror = (ev) => console.error('[minicap] error', ev)
        ws.onclose = () => {
          if (screenWs !== ws) return
          screenWs = null
          minicapConnecting.value = false
          if (screenMode.value !== 'minicap' || !device.deviceId.value) return
          minicapRetryTimer = window.setTimeout(connectMinicap, 1500)
        }
      }

      function setScreenMode(mode) {
        if (screenMode.value === mode) return
        screenMode.value = mode
        saveScreenMode(mode)
      }

      async function toggleScreenMode() {
        if (suppressToolbarClick) return
        if (!device.deviceId.value) return ElMessage.warning('Connect first')
        const next = screenMode.value === 'minicap' ? 'screenshot' : 'minicap'
        if (next === 'minicap' && !screenWebSocketUrl.value) {
          ElMessage.warning('当前设备不支持 minicap（连接响应未提供 WebSocket 地址）')
          return
        }
        setScreenMode(next)
        if (next === 'minicap') {
          connectMinicap()
        } else {
          closeMinicap()
          try {
            await refreshScreenshot()
          } catch (e) {
            ElMessage.error('Screenshot failed: ' + e.message)
          }
        }
      }

      async function refreshScreenshotFromToolbar() {
        if (suppressToolbarClick || screenshotLoading.value) return
        if (!device.deviceId.value) {
          ElMessage.warning('Connect first')
          return
        }
        if (screenMode.value === 'minicap') {
          connectMinicap()
          ElMessage.success('minicap 重新连接中')
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
          screenWebSocketUrl.value = data.screenWebSocketUrl || null
          closeMinicap()
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
            if (screenMode.value === 'minicap') {
              if (screenWebSocketUrl.value) {
                connectMinicap()
              } else {
                setScreenMode('screenshot')
                ElMessage.warning('当前设备不支持 minicap，已切换为截图投屏')
                await refreshScreenshot()
              }
            } else {
              await refreshScreenshot()
            }
          } catch (e) {
            ElMessage.warning('Screenshot failed: ' + e.message)
          }
          shellRun(C.genPreloadCode(data.deviceId))
          if (editor.code.value === '') {
            setCode(C.genClearCode(device.platform.value, device.serial.value))
          }
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
          if (screenMode.value !== 'minicap') await refreshScreenshot()
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
            if (resp.success) {
              code = C.genTemplateTap(resp.path)
              loadTemplateAssets()
            }
          } catch (e) { ElMessage.error('Template crop failed: ' + e.message) }
        }
        if (!code) return
        setCode(code)
        shellRun(code)
      }

      function setCode(code) {
        editor.code.value = code
        if (monacoEditor && monacoEditor.getValue() !== code) monacoEditor.setValue(code)
        markFileDirty()
      }

      function fileErrorText(e) {
        return e && e.message ? e.message : String(e)
      }

      function splitPath(path) {
        return String(path || '').trim().replace(/\\/g, '/').split('/').filter(Boolean)
      }

      async function getDirectoryHandle(parts, create) {
        let current = directoryHandle
        for (const part of parts) {
          current = await current.getDirectoryHandle(part, { create: !!create })
        }
        return current
      }

      async function getFileHandle(path, create) {
        const parts = splitPath(path)
        if (!parts.length) throw new Error('invalid file path')
        const parent = await getDirectoryHandle(parts.slice(0, -1), create)
        return parent.getFileHandle(parts[parts.length - 1], { create: !!create })
      }

      async function getEntryHandle(path) {
        const parts = splitPath(path)
        if (!parts.length) throw new Error('invalid path')
        const parent = await getDirectoryHandle(parts.slice(0, -1), false)
        const name = parts[parts.length - 1]
        try {
          return await parent.getFileHandle(name)
        } catch (e) {
          return parent.getDirectoryHandle(name)
        }
      }

      async function readFileTextFromHandle(handle) {
        const file = await handle.getFile()
        return file.text()
      }

      async function writeFileHandle(handle, text) {
        const writable = await handle.createWritable()
        try {
          await writable.write(text)
          await writable.close()
        } catch (e) {
          try {
            await writable.abort()
          } catch (err) {}
          throw e
        }
      }

      async function removeEntryByPath(path) {
        const parts = splitPath(path)
        if (!parts.length) throw new Error('invalid path')
        const parent = await getDirectoryHandle(parts.slice(0, -1), false)
        await parent.removeEntry(parts[parts.length - 1], { recursive: true })
      }

      async function copyHandleToPath(handle, path) {
        if (handle.kind === 'file') {
          const target = await getFileHandle(path, true)
          await writeFileHandle(target, await readFileTextFromHandle(handle))
          return
        }
        await getDirectoryHandle(splitPath(path), true)
        for await (const [name, child] of handle.entries()) {
          await copyHandleToPath(child, path ? path + '/' + name : name)
        }
      }

      async function openProject() {
        if (typeof window.showDirectoryPicker !== 'function') {
          ElMessage.error('当前浏览器不支持网页文件夹选择框，请使用 Chrome/Edge')
          return
        }
        try {
          const handle = await window.showDirectoryPicker()
          directoryHandle = handle
          projectPath.value = handle.name || '项目'
          currentFilePath.value = ''
          currentFileName.value = '未命名.py'
          selectedFileNode.value = null
          suppressFileDirty = true
          try {
            setCode('')
          } finally {
            suppressFileDirty = false
          }
          fileDirty.value = false
          await loadWorkspaceTree()
          ElMessage.success('已打开项目 ' + projectPath.value)
        } catch (e) {
          if (e && e.name === 'AbortError') return
          ElMessage.error('打开项目失败: ' + fileErrorText(e))
        }
      }

      async function describeHandle(name, path, handle) {
        if (handle.kind === 'file') {
          fileHandles.set(path, handle)
          return { name, path, type: 'file', leaf: true }
        }
        const children = []
        for await (const [childName, childHandle] of handle.entries()) {
          children.push(await describeHandle(childName, path ? path + '/' + childName : childName, childHandle))
        }
        children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)))
        return { name, path, type: 'dir', leaf: false, children }
      }

      async function loadWorkspaceTree() {
        fileHandles.clear()
        if (!directoryHandle) {
          fileTreeData.value = []
          return
        }
        workspaceLoading.value = true
        try {
          const items = []
          for await (const [name, handle] of directoryHandle.entries()) {
            items.push(await describeHandle(name, name, handle))
          }
          items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)))
          fileTreeData.value = items
        } catch (e) {
          ElMessage.error('工作区加载失败: ' + fileErrorText(e))
        } finally {
          workspaceLoading.value = false
        }
      }

      async function openWorkspaceFile(data) {
        if (!data || data.type !== 'file') return
        try {
          const handle = fileHandles.get(data.path) || await getFileHandle(data.path, false)
          fileHandles.set(data.path, handle)
          const text = await readFileTextFromHandle(handle)
          suppressFileDirty = true
          currentFilePath.value = data.path
          currentFileName.value = data.name
          try {
            setCode(text)
          } finally {
            suppressFileDirty = false
          }
          fileDirty.value = false
          ElMessage.success('已打开 ' + data.path)
        } catch (e) {
          ElMessage.error('打开文件失败: ' + fileErrorText(e))
        }
      }

      function onFileTreeNodeClick(data) {
        selectedFileNode.value = data
        if (data && data.type === 'file') openWorkspaceFile(data)
      }

      async function saveWorkspaceFile(text) {
        if (!directoryHandle) return ElMessage.warning('请先打开项目')
        let path = currentFilePath.value
        if (!path) {
          let answer
          try {
            answer = await ElMessageBox.prompt('输入项目内文件路径，例如 demo.py', '另存为', {
              confirmButtonText: '保存',
              cancelButtonText: '取消',
              inputValue: currentFileName.value || '未命名.py',
            })
          } catch (e) {
            return
          }
          path = String(answer.value || '').trim().replace(/\\/g, '/')
          if (!path) return
        }
        try {
          const handle = await getFileHandle(path, true)
          await writeFileHandle(handle, text)
          fileHandles.set(path, handle)
          currentFilePath.value = path
          currentFileName.value = path.split('/').pop() || '未命名.py'
          fileDirty.value = false
          await loadWorkspaceTree()
          ElMessage.success('已同步到 ' + path)
        } catch (e) {
          ElMessage.error('保存失败: ' + fileErrorText(e))
        }
      }

      async function createWorkspaceEntry(kind) {
        if (!directoryHandle) return ElMessage.warning('请先打开项目')
        let answer
        try {
          answer = await ElMessageBox.prompt(
            kind === 'dir' ? '输入目录路径，例如 scripts/demo' : '输入文件路径，例如 demo.py',
            kind === 'dir' ? '新建目录' : '新建文件',
            {
              confirmButtonText: '创建',
              cancelButtonText: '取消',
              inputValue: kind === 'dir' ? '' : '未命名.py',
            })
        } catch (e) {
          return
        }
        const path = String(answer.value || '').trim().replace(/\\/g, '/')
        if (!path) return
        try {
          if (kind === 'dir') {
            const parts = splitPath(path)
            const parent = await getDirectoryHandle(parts.slice(0, -1), true)
            await parent.getDirectoryHandle(parts[parts.length - 1], { create: true })
          } else {
            const handle = await getFileHandle(path, true)
            await writeFileHandle(handle, '')
            fileHandles.set(path, handle)
          }
          await loadWorkspaceTree()
          if (kind === 'file') {
            currentFilePath.value = path
            currentFileName.value = path.split('/').pop() || '未命名.py'
            suppressFileDirty = true
            try {
              setCode('')
            } finally {
              suppressFileDirty = false
            }
            fileDirty.value = false
          }
          ElMessage.success('已创建 ' + path)
        } catch (e) {
          ElMessage.error('创建失败: ' + fileErrorText(e))
        }
      }

      async function renameWorkspaceEntry() {
        if (!directoryHandle) return ElMessage.warning('请先打开项目')
        const node = selectedFileNode.value
        const path = node && node.path ? node.path : currentFilePath.value
        if (!path) return ElMessage.warning('请先选择文件或目录')
        let answer
        try {
          answer = await ElMessageBox.prompt('输入新路径', '重命名', {
            confirmButtonText: '重命名',
            cancelButtonText: '取消',
            inputValue: path,
          })
        } catch (e) {
          return
        }
        const newPath = String(answer.value || '').trim().replace(/\\/g, '/')
        if (!newPath || newPath === path) return
        try {
          const handle = await getEntryHandle(path)
          await copyHandleToPath(handle, newPath)
          await removeEntryByPath(path)
          if (currentFilePath.value === path) {
            currentFilePath.value = newPath
            currentFileName.value = newPath.split('/').pop() || '未命名.py'
          }
          selectedFileNode.value = null
          await loadWorkspaceTree()
          ElMessage.success('已重命名')
        } catch (e) {
          ElMessage.error('重命名失败: ' + fileErrorText(e))
        }
      }

      async function deleteWorkspaceEntry() {
        if (!directoryHandle) return ElMessage.warning('请先打开项目')
        const node = selectedFileNode.value
        const path = node && node.path ? node.path : currentFilePath.value
        if (!path) return ElMessage.warning('请先选择文件或目录')
        try {
          await ElMessageBox.confirm('确定删除 ' + path + '？', '删除', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
          })
          await removeEntryByPath(path)
          if (currentFilePath.value === path) {
            currentFilePath.value = ''
            currentFileName.value = '未命名.py'
            suppressFileDirty = true
            try {
              setCode('')
            } finally {
              suppressFileDirty = false
            }
            fileDirty.value = false
          }
          selectedFileNode.value = null
          await loadWorkspaceTree()
          ElMessage.success('已删除 ' + path)
        } catch (e) {
          if (e === 'cancel' || e === 'close') return
          ElMessage.error('删除失败: ' + fileErrorText(e))
        }
      }

      async function saveCodeFile() {
        try {
          await saveWorkspaceFile(editorCode())
        } catch (e) {
          ElMessage.error('保存失败: ' + fileErrorText(e))
        }
      }

      function insertAtCursor(text) {
        if (!monacoEditor) {
          editor.code.value += text
          return false
        }
        monacoEditor.executeEdits('weditor-screen-touch', [{
          range: monacoEditor.getSelection(),
          text,
          forceMoveMarkers: true,
        }])
        monacoEditor.focus()
        return true
      }

      function insertSnippet(code) {
        if (!monacoEditor) {
          const current = editor.code.value
          const lead = current && !current.endsWith('\n') ? '\n' : ''
          editor.code.value = current + lead + code + '\n'
          return null
        }
        const model = monacoEditor.getModel()
        const selection = monacoEditor.getSelection()
        const startPos = selection.getStartPosition()
        const startText = model.getLineContent(selection.startLineNumber)
        const endText = model.getLineContent(selection.endLineNumber)
        const before = startText.slice(0, Math.max(0, selection.startColumn - 1))
        const after = endText.slice(Math.max(0, selection.endColumn - 1))
        const indent = (startText.match(/^\s*/) || [''])[0]
        const prefix = before.trim() ? '\n' + indent : ''
        const suffix = after.length ? '\n' + indent : ''
        monacoEditor.pushUndoStop()
        monacoEditor.executeEdits('weditor-coding-actions', [{
          range: selection,
          text: prefix + code + suffix,
          forceMoveMarkers: true,
        }])
        monacoEditor.pushUndoStop()
        monacoEditor.focus()
        return { model, startPos, prefix }
      }

      function screenshotBase64() {
        const value = screenImg.value
        if (typeof value === 'string' && value.startsWith('data:')) {
          const comma = value.indexOf(',')
          if (comma >= 0) return value.slice(comma + 1)
        }
        return localStorage.getItem('screenshotBase64') || ''
      }

      async function currentScreenshotBase64() {
        const img = screenImgEl.value
        if (img && img.complete && img.naturalWidth && img.naturalHeight) {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            canvas.getContext('2d').drawImage(img, 0, 0)
            return canvas.toDataURL('image/jpeg').split(',')[1]
          } catch (e) {}
        }
        return screenshotBase64()
      }

      function screenshotBounds(bounds) {
        const img = screenImgEl.value
        const size = deviceCoordinateSize.value
        if (!img || !img.naturalWidth || !size || !size.width || !size.height) return bounds
        const sx = img.naturalWidth / size.width
        const sy = img.naturalHeight / size.height
        return bounds.map((value, index) => Math.round(value * (index % 2 === 0 ? sx : sy)))
      }

      function newlineAfterCommand(lineNumber) {
        if (!monacoEditor) return
        const model = monacoEditor.getModel()
        const maxColumn = model.getLineMaxColumn(lineNumber)
        const indent = (model.getLineContent(lineNumber).match(/^\s*/) || [''])[0]
        const edits = []
        let cursorColumn
        if (lineNumber < model.getLineCount()) {
          cursorColumn = ((model.getLineContent(lineNumber + 1).match(/^\s*/) || [''])[0]).length + 1
        } else {
          edits.push({
            range: {
              startLineNumber: lineNumber,
              startColumn: maxColumn,
              endLineNumber: lineNumber,
              endColumn: maxColumn,
            },
            text: '\n' + indent,
            forceMoveMarkers: true,
          })
          cursorColumn = indent.length + 1
        }
        if (edits.length) {
          monacoEditor.pushUndoStop()
          monacoEditor.executeEdits('weditor-command-newline', edits)
          monacoEditor.pushUndoStop()
        }
        monacoEditor.setPosition({ lineNumber: lineNumber + 1, column: cursorColumn })
        monacoEditor.focus()
      }

      async function saveTemplateFill(bounds) {
        if (!monacoEditor) return
        const actionId = templateFillAction || 'wait'
        if (!templateFillRange) {
          ElMessage.error('模板参数选中状态已失效，请重新点击 ' + actionId)
          clearTemplateFill()
          return
        }
        const range = templateFillRange
        const lineNumber = range.startLineNumber
        templateFillRange = null
        const name = 'temp_' + Date.now()
        try {
          const shot = await currentScreenshotBase64()
          if (!shot) throw new Error('当前截图为空，请先刷新截图')
          const croppedBounds = screenshotBounds(bounds)
          const resp = await fetch('/api/v1/template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              screenshot: shot,
              bounds: croppedBounds,
              name,
            }),
          }).then(r => r.json())
          if (!resp.success) throw new Error(resp.description || 'save failed')
          monacoEditor.pushUndoStop()
          monacoEditor.executeEdits('weditor-template-fill', [{
            range,
            text: resp.path,
            forceMoveMarkers: true,
          }])
          monacoEditor.pushUndoStop()
          monacoEditor.setPosition({ lineNumber, column: range.startColumn + String(resp.path).length })
          newlineAfterCommand(lineNumber)
          activeSnippet.value = actionId
          loadTemplateAssets()
          ElMessage.success('已保存模板并填充路径')
          logInteraction('模板模式', '框选截图保存并填充 ' + actionId + ' 参数', { name, path: resp.path, bounds })
        } catch (e) {
          ElMessage.error('模板截图保存失败: ' + (e && e.message ? e.message : String(e)))
        } finally {
          clearTemplateFill()
          templateRect.value = null
        }
      }

      function useAction(action) {
        if (!codingMode.value) return
        const templateMode = action.id === 'wait' || action.id === 'exists'
          || (action.id === 'touch' && editor.tapMode.value === 'template')
        if (templateMode && editor.tapMode.value !== 'template') {
          suppressTemplateClear = true
          editor.tapMode.value = 'template'
        }
        const code = templateMode && action.templateCode ? action.templateCode : action.code
        const inserted = insertSnippet(code)
        activeSnippet.value = action.id
        if (templateMode && inserted) {
          clearCoordFill()
          clearTemplateFill()
          const placeholder = 'tpl.png'
          const offset = inserted.model.getOffsetAt(inserted.startPos)
            + inserted.prefix.length + code.indexOf(placeholder)
          const p1 = inserted.model.getPositionAt(offset)
          const p2 = inserted.model.getPositionAt(offset + placeholder.length)
          templateFillRange = {
            startLineNumber: p1.lineNumber,
            startColumn: p1.column,
            endLineNumber: p2.lineNumber,
            endColumn: p2.column,
          }
          templateFillAction = action.id
          monacoEditor.setSelection(templateFillRange)
          monacoEditor.revealRangeInCenter(templateFillRange)
          pendingTemplateFill.value = true
          templateHintText.value = '在 Screen 框选范围后截图保存模板'
          ElMessage({
            message: templateHintText.value,
            type: 'info',
            duration: 4000,
          })
          return
        }
        if (action.id === 'log' && inserted) {
          clearCoordFill()
          clearTemplateFill()
          const placeholder = 'message'
          const offset = inserted.model.getOffsetAt(inserted.startPos)
            + inserted.prefix.length + action.code.indexOf(placeholder)
          const p1 = inserted.model.getPositionAt(offset)
          const p2 = inserted.model.getPositionAt(offset + placeholder.length)
          monacoEditor.setSelection({
            startLineNumber: p1.lineNumber,
            startColumn: p1.column,
            endLineNumber: p2.lineNumber,
            endColumn: p2.column,
          })
          monacoEditor.revealRangeInCenter(monacoEditor.getSelection())
          ElMessage({
            message: '已插入 log 代码，可直接输入日志内容',
            type: 'info',
            duration: 2000,
          })
          return
        }
        const placeholders = action.id === 'touch' ? ['x, y']
          : action.id === 'swipe' ? ['x1, y1', 'x2, y2'] : null
        if (placeholders && editor.tapMode.value === 'coordinate' && inserted) {
          clearCoordFill()
          const baseOffset = inserted.model.getOffsetAt(inserted.startPos) + inserted.prefix.length
          const ranges = placeholders.map((placeholder) => {
            const offset = baseOffset + action.code.indexOf(placeholder)
            const p1 = inserted.model.getPositionAt(offset)
            const p2 = inserted.model.getPositionAt(offset + placeholder.length)
            return {
              startLineNumber: p1.lineNumber,
              startColumn: p1.column,
              endLineNumber: p2.lineNumber,
              endColumn: p2.column,
            }
          })
          coordFillPlan = { kind: action.id, ranges, index: 0 }
          coordFillRange = ranges[0]
          monacoEditor.setSelection(coordFillRange)
          monacoEditor.revealRangeInCenter(coordFillRange)
          pendingCoordHint.value = true
          coordHintText.value = action.id === 'swipe'
            ? '双击 Screen 填充起点 x1, y1（1/2）'
            : '双击 Screen 填充 x, y'
          ElMessage({
            message: coordHintText.value,
            type: 'info',
            duration: 4000,
          })
          return
        }
        clearCoordFill()
        clearTemplateFill()
        ElMessage({
          message: '已插入 ' + action.label + ' 代码',
          type: 'success',
          duration: 1200,
        })
      }

      function toggleActions() {
        actionsCollapsed.value = !actionsCollapsed.value
      }

      function actionGroupName(group) {
        return ACTION_GROUP_LABELS[group] || ''
      }

      async function loadTemplateAssets() {
        templateAssetsLoading.value = true
        try {
          const data = await fetch('/api/v1/templates').then(r => r.json())
          if (!data.success) throw new Error(data.description || 'load failed')
          templateAssets.value = data.items || []
        } catch (e) {
          ElMessage.error('资源加载失败: ' + e.message)
        } finally {
          templateAssetsLoading.value = false
        }
      }

      async function deleteTemplateAsset(item) {
        try {
          const data = await fetch('/api/v1/templates', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: item.filename }),
          }).then(r => r.json())
          if (!data.success) throw new Error(data.description || 'delete failed')
          ElMessage.success('已删除 ' + item.filename)
          await loadTemplateAssets()
        } catch (e) {
          ElMessage.error('删除失败: ' + e.message)
        }
      }

      function useTemplateAsset(item) {
        setCode(C.genTemplateTap(item.path))
        ElMessage.success('已插入模板代码')
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
              value: editor.code.value || C.genClearCode(device.platform.value, device.serial.value),
              language: 'python',
              theme: 'vs-dark',
              automaticLayout: true,
              minimap: { enabled: false },
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
            })
            monacoEditor.onDidChangeModelContent(() => {
              editor.code.value = monacoEditor.getValue()
              markFileDirty()
              if (!coordFillEditing && coordFillRange) clearCoordFill()
              if (templateFillRange) clearTemplateFill()
            })
            monacoEditor.onDidChangeCursorSelection((e) => {
              const s = e.selection
              if (coordFillRange && !coordFillEditing) {
                const r = coordFillRange
                if (s.startLineNumber !== r.startLineNumber || s.startColumn !== r.startColumn
                  || s.endLineNumber !== r.endLineNumber || s.endColumn !== r.endColumn) {
                  clearCoordFill()
                }
              }
              if (templateFillRange) {
                const r = templateFillRange
                if (s.startLineNumber !== r.startLineNumber || s.startColumn !== r.startColumn
                  || s.endLineNumber !== r.endLineNumber || s.endColumn !== r.endColumn) {
                  clearTemplateFill()
                }
              }
            })
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

      watch(rightTab, (tab) => {
        nextTick(() => { if (monacoEditor) monacoEditor.layout() })
        if (tab === 'assets') loadTemplateAssets()
      })

      onMounted(async () => {
        fetchVersion()
        loadWorkspaceTree()
        await nextTick()
        toolbarPos.value = clampToolbarPosition(toolbarPos.value.x, toolbarPos.value.y)
        const main = getMainElement()
        if (main) {
          const rect = main.getBoundingClientRect()
          if (rect.width) screenPaneWidth.value = clampSplitRatio(loadSplitRatio(), rect).toFixed(2) + '%'
        }
        onWorkspaceResize()
        await initMonaco()
        window.addEventListener('resize', fitScreen)
        window.addEventListener('resize', onWorkspaceResize)
        window.addEventListener('resize', onToolbarWindowResize)
        if (window.ResizeObserver && screenAreaEl.value) {
          new ResizeObserver(fitScreen).observe(screenAreaEl.value)
        }
        if (window.ResizeObserver && codeWorkspaceEl.value) {
          workspaceObserver = new ResizeObserver((entries) => {
            workspaceWidth.value = entries[0].contentRect.width
          })
          workspaceObserver.observe(codeWorkspaceEl.value)
        }
      })
      onBeforeUnmount(() => {
        stopSplitResize()
        stopConsoleResize()
        stopToolbarDrag()
        closeMinicap()
        removeGestureListeners()
        if (workspaceObserver) workspaceObserver.disconnect()
        window.removeEventListener('resize', fitScreen)
        window.removeEventListener('resize', onWorkspaceResize)
        window.removeEventListener('resize', onToolbarWindowResize)
      })

      return {
        version, device, shell, editor, screenImg, selectedNode, selectedInfo,
        hierarchyTree, codeContainer, treeLabel, screenAreaEl, screenImgEl,
        screenPaneWidth, splitterActive, consoleHeight, consoleSplitterActive,
        consoleLevels, visibleConsoleOutput, LOG_LEVELS,
        frameStyle, rightTab, codingMode, activeMode, templateRect,
        codeWorkspaceEl, actionsCollapsed, actionsCompact, activeSnippet,
        pendingCoordHint, coordHintText, pendingTemplateFill, templateHintText,
        codingActions: CODING_ACTIONS,
        templateAssets, templateAssetsLoading,
        toolbarEl, toolbarStyle, toolbarDragging, screenshotLoading,
        screenMode, screenModeLabel, screenModeTitle, screenWebSocketUrl, minicapConnecting,
        screenInfoText, displaySizeText, zoomPercent, cursorText,
        cursorPoint, coordTipStyle,
        doConnect, dumpHierarchy, onNodeClick, doTap, fitScreen, startSplitResize, startConsoleResize,
        loadTemplateAssets, deleteTemplateAsset, useTemplateAsset,
        startToolbarDrag, refreshScreenshotFromToolbar, toggleScreenMode,
        onScreenMouseDown, onScreenMouseMove, onScreenMouseLeave,
        runCode, runSelected, runCurrentLine, shellInterrupt, shellRestart,
        toggleConsoleLevel, resetConsoleSettings,
        useAction, toggleActions, actionGroupName,
        currentFileName, fileDirty, fileTabLabel,
        fileTreeData, selectedFileNode, currentFilePath, workspaceLoading,
        projectPath, projectLabel,
        saveCodeFile,
        openProject,
        loadWorkspaceTree, openWorkspaceFile, onFileTreeNodeClick,
        createWorkspaceEntry, renameWorkspaceEntry, deleteWorkspaceEntry,
        genClearCode: C.genClearCode,
      }
    },
    template: `
      <el-container class="layout">
        <el-header class="header menu-bar">
          <span class="brand">WEditor <small>{{ version }}</small></span>
          <div class="menu-groups">
            <div class="menu-switch" :title="screenModeTitle">
              <span class="menu-label">投屏</span>
              <el-switch
                :model-value="screenMode === 'minicap'"
                :disabled="minicapConnecting"
                active-text="minicap"
                inactive-text="截图"
                @change="toggleScreenMode"
              />
            </div>

            <el-button size="small" type="primary" :loading="device.connecting.value" @click="doConnect">Connect</el-button>
            <el-button size="small" :loading="device.loading.value" @click="dumpHierarchy">Dump</el-button>
          </div>
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
              <span v-if="device.deviceId.value" class="devid">{{ device.deviceId.value }}</span>
            </div>
            <div class="panel-title">
              Screen
              <div class="screen-meta">
                <span>投屏：{{ screenModeLabel }}</span>
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
                <div
                  v-if="activeMode === 'template' && templateRect"
                  class="template-selection"
                  :style="templateRect"
                ></div>
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
            <div ref="codeWorkspaceEl" class="code-workspace">
              <el-tabs v-model="rightTab" class="right-tabs">
                <el-tab-pane label="Coding" name="coding">
                  <div class="panel-title coding-toolbar">
                    Coding
                    <el-switch
                      v-model="codingMode"
                      class="coding-mode-switch"
                      size="small"
                      active-text="编程"
                      inactive-text="操作"
                    />
                    <el-radio-group v-model="editor.tapMode.value" size="small">
                      <el-radio-button value="coordinate" :disabled="pendingTemplateFill">坐标</el-radio-button>
                      <el-radio-button value="template">模板</el-radio-button>
                    </el-radio-group>
                    <el-button size="small" type="primary" @click="runCode">Run</el-button>
                    <el-button size="small" @click="runSelected">Sel</el-button>
                    <el-button size="small" @click="runCurrentLine">Line</el-button>
                    <el-button size="small" type="warning" :disabled="!shell.running.value" @click="shellInterrupt">Stop</el-button>
                    <el-button size="small" :loading="shell.restarting.value" @click="shellRestart">Restart</el-button>
                    <span v-if="pendingCoordHint" class="coord-fill-hint">{{ coordHintText }}</span>
                    <span v-else-if="pendingTemplateFill" class="coord-fill-hint">{{ templateHintText }}</span>
                  </div>
                  <div class="coding-body">
                    <div class="coding-explorer" aria-label="Explorer">
                      <div class="explorer-panel">
                        <div class="explorer-title">
                          <span :title="projectPath || 'Explorer'">{{ projectLabel }}</span>
                          <span class="explorer-actions" aria-hidden="true">···</span>
                        </div>
                        <div class="explorer-toolbar">
                          <div class="explorer-toolbar-row">
                            <button type="button" class="explorer-toolbar-button" title="打开项目目录" @click="openProject">打开项目</button>
                            <button type="button" class="explorer-toolbar-button primary" title="保存到工作区" @click="saveCodeFile">保存</button>
                          </div>
                          <div class="explorer-toolbar-row">
                            <button type="button" class="explorer-toolbar-button" title="新建文件" @click="createWorkspaceEntry('file')">新建</button>
                            <button type="button" class="explorer-toolbar-button" title="新建目录" @click="createWorkspaceEntry('dir')">目录</button>
                            <button type="button" class="explorer-toolbar-button" title="重命名" @click="renameWorkspaceEntry">改名</button>
                            <button type="button" class="explorer-toolbar-button danger" title="删除" @click="deleteWorkspaceEntry">删除</button>
                          </div>
                        </div>
                        <div class="explorer-tree">
                          <el-tree
                            v-loading="workspaceLoading"
                            :data="fileTreeData"
                            node-key="path"
                            :props="{ children: 'children', label: 'name', isLeaf: 'leaf' }"
                            highlight-current
                            :default-expand-all="true"
                            @node-click="onFileTreeNodeClick"
                          >
                            <template #default="{ node, data }">
                              <span class="explorer-tree-node" :title="data.path">
                                <span class="explorer-tree-icon" :class="data.type === 'dir' ? 'folder-icon' : 'python-icon'">
                                  <svg v-if="data.type === 'dir'" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 5h7l2 2h11v12H2V5zm2 2v10h16V9H9.41L7.41 7H4z"/></svg>
                                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6V2zm2 2v16h8V7h-3V4H8zm2 3h3v3h-3V7zm0 5h5v2h-5v-2zm0 4h5v2h-5v-2z"/></svg>
                                </span>
                                <span class="explorer-tree-label" :class="{ dirty: data.path === currentFilePath && fileDirty }">{{ node.label }}</span>
                              </span>
                            </template>
                          </el-tree>
                          <div v-if="!fileTreeData.length && !workspaceLoading" class="placeholder">工作区为空</div>
                        </div>
                      </div>
                    </div>
                    <div class="coding-editor-area">
                      <div class="coding-actions" :class="{ compact: actionsCompact }">
                      <el-tooltip
                        placement="top"
                        effect="dark"
                        :show-after="200"
                        :popper-options="{ modifiers: [{ name: 'flip', enabled: false }] }"
                      >
                        <template #content>
                          <div class="action-tip">
                            <div class="action-tip-title">Code Actions · 代码快捷插入</div>
                            <div class="action-tip-desc">{{ actionsCollapsed ? '展开工具栏' : '收起工具栏（仅保留图标）' }}</div>
                          </div>
                        </template>
                        <button
                          type="button"
                          class="coding-actions-toggle"
                          :aria-label="actionsCollapsed ? '展开工具栏' : '收起工具栏'"
                          @click="toggleActions"
                        >
                          <span class="coding-actions-toggle-icon">{{ actionsCollapsed ? '»' : '«' }}</span>
                          <span class="coding-actions-toggle-text">工具</span>
                        </button>
                      </el-tooltip>
                      <el-tooltip
                        v-for="action in codingActions"
                        :key="action.id"
                        placement="top"
                        effect="dark"
                        :show-after="300"
                        :popper-options="{ modifiers: [{ name: 'flip', enabled: false }] }"
                      >
                        <template #content>
                          <div class="action-tip">
                            <div class="action-tip-title">{{ action.label }} · {{ action.name }}</div>
                            <div class="action-tip-group">分组：{{ actionGroupName(action.group) }}</div>
                            <div class="action-tip-desc">{{ action.description }}</div>
                            <div class="action-tip-code">{{ action.code }}</div>
                            <div v-if="!codingMode" class="action-tip-warn">请先将上方模式切换为「编程」</div>
                          </div>
                        </template>
                        <span class="coding-action-wrap">
                          <button
                            type="button"
                            class="coding-action"
                            :class="{ active: activeSnippet === action.id }"
                            :data-group="action.group"
                            :disabled="!codingMode"
                            :aria-pressed="activeSnippet === action.id"
                            :aria-label="action.label + ' ' + action.name"
                            @click="useAction(action)"
                          >
                            <span class="coding-action-icon" v-html="action.icon" aria-hidden="true"></span>
                            <span class="coding-action-label">{{ action.label }}</span>
                          </button>
                        </span>
                      </el-tooltip>
                      </div>
                      <div ref="codeContainer" class="editor-container"></div>
                    </div>
                  </div>
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
                <el-tab-pane label="Assets" name="assets">
                  <div class="panel-title resource-toolbar">
                    模板图片
                    <el-button size="small" :loading="templateAssetsLoading" @click="loadTemplateAssets">刷新</el-button>
                  </div>
                  <div v-if="templateAssets.length" class="asset-grid">
                    <div v-for="item in templateAssets" :key="item.filename" class="asset-card">
                      <div class="asset-thumb" @click="useTemplateAsset(item)" :title="'插入模板代码：' + item.filename">
                        <img :src="item.url" :alt="item.filename" />
                      </div>
                      <div class="asset-name" :title="item.filename">{{ item.filename }}</div>
                      <div class="asset-meta">{{ (item.size / 1024).toFixed(1) }} KB</div>
                      <el-button class="asset-delete" size="small" type="danger" plain @click="deleteTemplateAsset(item)">删除</el-button>
                    </div>
                  </div>
                  <div v-else class="placeholder">暂无模板图片。在 Hierarchy 中选中节点，切到模板模式后点击 Tap，生成的图片会保存在这里。</div>
                </el-tab-pane>
              </el-tabs>
              <div
                class="splitter splitter-horizontal"
                :class="{ active: consoleSplitterActive }"
                title="Drag to resize console"
                @mousedown="startConsoleResize"
              ></div>
              <div class="console-panel" :style="{ height: consoleHeight }">
                <div class="panel-title">Console</div>
                <div class="console-toolbar">
                  <label
                    v-for="lv in LOG_LEVELS"
                    :key="'filter-' + lv.key"
                    class="console-level-chip"
                    :class="{ off: !consoleLevels.includes(lv.key) }"
                    :title="'显示/隐藏 ' + lv.label + ' 日志'"
                  >
                    <input
                      type="checkbox"
                      :checked="consoleLevels.includes(lv.key)"
                      @change="toggleConsoleLevel(lv.key, $event)"
                    />
                    <span>{{ lv.label }}</span>
                  </label>
                  <button type="button" class="console-reset" title="重置级别过滤" @click="resetConsoleSettings">重置</button>
                </div>
                <div class="console">
                  <span
                    v-for="(line, i) in visibleConsoleOutput"
                    :key="i"
                    class="console-line"
                    :class="'log-' + line.level"
                  >{{ line.value }}</span>
                </div>
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
