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
    EXPLORER_WIDTH_KEY: K.EXPLORER_WIDTH_KEY,
    LOG_LEVELS: K.LOG_LEVELS, LOG_LEVEL_ALIASES: K.LOG_LEVEL_ALIASES,
    CODING_ACTIONS: K.CODING_ACTIONS,
    defaultConsoleLevels: P.defaultConsoleLevels, loadConsoleLevels: P.loadConsoleLevels,
    saveConsoleLevels: P.saveConsoleLevels, normalizeLogLevel: P.normalizeLogLevel,
    inferLogLevel: P.inferLogLevel, resolveLogLevel: P.resolveLogLevel,
    loadScreenMode: P.loadScreenMode, saveScreenMode: P.saveScreenMode,
    loadSplitRatio: P.loadSplitRatio, loadConsoleHeight: P.loadConsoleHeight,
    loadExplorerWidth: P.loadExplorerWidth, saveExplorerWidth: P.saveExplorerWidth,
    loadToolbarPosition: P.loadToolbarPosition, saveToolbarPosition: P.saveToolbarPosition,
  })
ctx.version = ref('...')
ctx.screenImg = ref(null)
ctx.screenReady = ref(false)
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
// 当前选中的命令：插入代码后，等待用 Screen 鼠标填充代码参数；填充完成后取消选中。
ctx.activeCommand = ref('')
ctx.codeWorkspaceEl = ref(null)
ctx.workspaceWidth = ref(0)
ctx.explorerWidth = ref(loadExplorerWidth() + 'px')
ctx.explorerSplitterActive = ref(false)
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
// 参数填充完成（或代码直接插入完成）后取消选中，并彻底复位 Screen 交互状态。
ctx.clearActiveCommand = function clearActiveCommand() {
  activeCommand.value = ''
  activeSnippet.value = ''
  screenGesture = null
  lastProgramTap = null
  lastTemplateTap = null
  templateBounds = null
  templateRect.value = null
  clearCursor()
  ctx.removeGestureListeners()
  clearCoordFill()
  clearTemplateFill()
}
watch(actionsCollapsed, (v) => {
  try { localStorage.setItem(ACTIONS_COLLAPSED_KEY, v ? '1' : '0') } catch (e) {}
  nextTick(() => { if (monacoEditor) monacoEditor.layout() })
})
ctx.templateAssets = ref([])
ctx.templateAssetsLoading = ref(false)
ctx.MODE_LABELS = { operate: '操作', template: '模板' }
ctx.TEMPLATE_COMMANDS = ['touchTemplate', 'wait', 'exists']
// Screen 模式只由当前选中的命令决定；没有命令时永远是默认的 tap/swipe。
ctx.activeMode = computed(() =>
  ctx.TEMPLATE_COMMANDS.includes(activeCommand.value) ? 'template' : 'operate')
// 命令 → 插入的代码与 Screen 鼠标触发关系（填充参数，而非执行设备手势）。
ctx.COMMAND_TRIGGERS = {
  touch: '已插入 touch((x, y))，双击 Screen 填充坐标',
  touchTemplate: '已插入 touch(Template(...))，框选 Screen 图像保存模板并填充路径',
  swipe: '已插入 swipe(...)，双击 Screen 依次填充起点与终点',
  wait: '已插入 wait(...)，框选 Screen 图像保存模板并填充路径',
  exists: '已插入 exists(...)，框选 Screen 图像保存模板并填充路径',
  text: '已插入 text(...)，可直接在编辑器中修改文本',
  keyevent: '已插入 keyevent(...)，可直接在编辑器中修改按键',
  snapshot: '已插入 snapshot(...)',
  sleep: '已插入 sleep(...)，可直接在编辑器中修改秒数',
  log: '已插入 log(...)，可直接在编辑器中修改日志内容',
}
ctx.activeCommandHint = computed(() => {
  const command = activeCommand.value
  return command ? ctx.COMMAND_TRIGGERS[command] || '' : ''
})
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
ctx.currentFilePath = ref(localStorage.getItem('lastFilePath') || '')
watch(currentFilePath, (v) => {
  try { localStorage.setItem('lastFilePath', v || '') } catch (e) {}
})
ctx.fileSource = ref('server')
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
ctx.minicapRetryTimer = null
// minicap 背压：只保留最新一帧，pending 帧由 requestAnimationFrame 统一消费。
ctx.minicapPendingFrame = null
ctx.minicapFrameScheduled = false
ctx.minicapDrawing = false

ctx.selectedInfo = computed(() => selectedNode.value || {})

ctx.formatSize = function formatSize(size) {
  return size ? `${size.width} × ${size.height}` : '-'
}

ctx.cursorText = computed(() => cursorPoint.value
  ? `${cursorPoint.value.x}, ${cursorPoint.value.y}`
  : '-')
ctx.screenMetaText = computed(() => {
  const parts = [screenModeLabel.value]
  if (screenshotSize.value) parts.push(formatSize(screenshotSize.value))
  if (displaySize.value) parts.push(formatSize(displaySize.value))
  parts.push(zoomPercent.value + '%', '坐标 ' + cursorText.value)
  return parts.join(' · ')
})
ctx.explorerMenu = ref({ visible: false, x: 0, y: 0, node: null })
ctx.explorerTreeRef = ref(null)
ctx.expandedDirKeys = ref([])


}
}
})()
