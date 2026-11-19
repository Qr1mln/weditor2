/* WEditor setup module: state + shared helpers */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installState = function (ctx) {
  const { createApp, ref, computed, onMounted, onBeforeUnmount, watch, nextTick } = Vue
  const C = window.Codegen
  const K = window.WEditorConstants
  const P = window.WEditorPersistence
  const S = window.WEditorStores

with (ctx) {
  Object.assign(ctx, {
    ref, computed, watch, nextTick, onMounted, onBeforeUnmount,
    C, device: S.device, shell: S.shell, editor: S.editor,
    SPLIT_RATIO_KEY: K.SPLIT_RATIO_KEY, CONSOLE_HEIGHT_KEY: K.CONSOLE_HEIGHT_KEY,
    TOOLBAR_POS_KEY: K.TOOLBAR_POS_KEY, SCREEN_MODE_KEY: K.SCREEN_MODE_KEY,
    ACTIONS_COLLAPSED_KEY: K.ACTIONS_COLLAPSED_KEY,
    ACTION_GROUP_LABELS: K.ACTION_GROUP_LABELS, CONSOLE_LEVELS_KEY: K.CONSOLE_LEVELS_KEY,
    LOG_LEVELS: K.LOG_LEVELS, LOG_LEVEL_ALIASES: K.LOG_LEVEL_ALIASES,
    CODING_ACTIONS: K.CODING_ACTIONS,
    defaultConsoleLevels: P.defaultConsoleLevels, loadConsoleLevels: P.loadConsoleLevels,
    saveConsoleLevels: P.saveConsoleLevels, normalizeLogLevel: P.normalizeLogLevel,
    inferLogLevel: P.inferLogLevel, resolveLogLevel: P.resolveLogLevel,
    loadScreenMode: P.loadScreenMode, saveScreenMode: P.saveScreenMode,
    loadSplitRatio: P.loadSplitRatio, loadConsoleHeight: P.loadConsoleHeight,
    loadToolbarPosition: P.loadToolbarPosition, saveToolbarPosition: P.saveToolbarPosition,
  })
ctx.version = ref('...')
ctx.screenImg = ref(null)
ctx.selectedNode = ref(null)
ctx.hierarchyTree = ref([])
ctx.codeContainer = ref(null)
ctx.screenAreaEl = ref(null)
ctx.screenImgEl = ref(null)
ctx.screenPaneWidth = ref(loadSplitRatio() + '%')
ctx.splitterActive = ref(false)
ctx.consoleHeight = ref(loadConsoleHeight() + 'px')
ctx.consoleSplitterActive = ref(false)
ctx.consoleLevels = ref(loadConsoleLevels())
ctx.visibleConsoleOutput = computed(() =>
  shell.output.value.filter(o => consoleLevels.value.includes(o.level)))
watch(consoleLevels, v => saveConsoleLevels(v), { deep: true })
ctx.deviceCoordinateSize = ref(null)
ctx.screenshotSize = ref(null)
ctx.displaySize = ref(null)
ctx.zoomPercent = ref(0)
ctx.cursorPoint = ref(null)
ctx.coordTipStyle = ref({})
ctx.frameStyle = ref({})
ctx.templateRect = ref(null)
ctx.rightTab = ref('coding')
ctx.codingMode = ref(false) // false=操作, true=编程
ctx.codeWorkspaceEl = ref(null)
ctx.workspaceWidth = ref(0)
ctx.actionsCollapsed = ref(localStorage.getItem(ACTIONS_COLLAPSED_KEY) === '1')
ctx.actionsCompact = computed(() => actionsCollapsed.value
  || (workspaceWidth.value > 0 && workspaceWidth.value < 560))
ctx.activeSnippet = ref('')
ctx.pendingCoordHint = ref(false)
ctx.coordHintText = ref('')
ctx.pendingTemplateFill = ref(false)
ctx.templateHintText = ref('')
ctx.coordFillRange = null
ctx.coordFillPlan = null
ctx.coordFillEditing = false
ctx.templateFillRange = null
ctx.templateBounds = null
ctx.templateFillAction = null
ctx.suppressTemplateClear = false
ctx.workspaceObserver = null
ctx.clearCoordFill = function clearCoordFill() {
  coordFillRange = null
  coordFillPlan = null
  pendingCoordHint.value = false
  coordHintText.value = ''
}
ctx.clearTemplateFill = function clearTemplateFill() {
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
ctx.templateAssets = ref([])
ctx.templateAssetsLoading = ref(false)
ctx.MODE_LABELS = { operate: '操作', program: '编程', template: '模板' }
ctx.modeFrom = function modeFrom(coding, tap) {
  return !coding ? 'operate' : (tap === 'template' ? 'template' : 'program')
}
ctx.activeMode = computed(() => modeFrom(codingMode.value, editor.tapMode.value))
ctx.toolbarEl = ref(null)
ctx.toolbarPos = ref(loadToolbarPosition())
ctx.toolbarDragging = ref(false)
ctx.screenshotLoading = ref(false)
ctx.screenMode = ref(loadScreenMode())
ctx.screenWebSocketUrl = ref(null)
ctx.minicapConnecting = ref(false)
ctx.toolbarStyle = computed(() => ({
  transform: `translate3d(${toolbarPos.value.x}px, ${toolbarPos.value.y}px, 0)`,
}))
ctx.screenModeLabel = computed(() => screenMode.value === 'minicap' ? 'minicap' : '截图')
ctx.screenModeTitle = computed(() => screenMode.value === 'minicap'
  ? '当前：minicap 实时投屏，点击切换到截图'
  : '当前：截图投屏，点击切换到 minicap')
ctx.monacoEditor = null
ctx.currentFileName = ref('未命名.py')
ctx.fileDirty = ref(false)
ctx.fileTreeData = ref([])
ctx.selectedFileNode = ref(null)
ctx.currentFilePath = ref('')
ctx.workspaceLoading = ref(false)
ctx.projectPath = ref('')
ctx.projectLabel = computed(() => {
  const parts = projectPath.value.split(/[\\/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : 'Explorer'
})
ctx.fileTabLabel = computed(() =>
  (currentFileName.value || '未命名.py') + (fileDirty.value ? ' *' : ''))
ctx.suppressFileDirty = false
ctx.directoryHandle = null
ctx.fileHandles = new Map()
ctx.markFileDirty = function markFileDirty() {
  if (!suppressFileDirty) fileDirty.value = true
}
ctx.splitting = false
ctx.consoleResizing = false
ctx.screenGesture = null
ctx.lastProgramTap = null
ctx.lastTemplateTap = null
ctx.DOUBLE_TAP_MS = 400
ctx.DOUBLE_TAP_DISTANCE = 8
ctx.toolbarDrag = null
ctx.suppressToolbarClick = false
ctx.hasConnectedOnce = false
ctx.screenWs = null
ctx.minicapObjectUrl = null
ctx.minicapRetryTimer = null

ctx.selectedInfo = computed(() => selectedNode.value || {})

ctx.formatSize = function formatSize(size) {
  return size ? `${size.width} × ${size.height}` : '-'
}

ctx.screenInfoText = computed(() => {
  return screenshotSize.value ? '截图 ' + formatSize(screenshotSize.value) : '-'
})
ctx.displaySizeText = computed(() => formatSize(displaySize.value))
ctx.cursorText = computed(() => cursorPoint.value
  ? `${cursorPoint.value.x}, ${cursorPoint.value.y}`
  : '-')


}
}
})()
