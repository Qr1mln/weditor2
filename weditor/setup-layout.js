/* WEditor setup module: splitters + drag */
(function () {
let explorerResizing = false
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installLayout = function (ctx) {

with (ctx) {
ctx.getMainElement = function getMainElement() {
  return document.querySelector('.main')
}

ctx.clampSplitRatio = function clampSplitRatio(ratio, rect) {
  const minLeft = 240
  const minRight = 300
  const maxLeft = Math.max(minLeft, rect.width - minRight)
  const minRatio = Math.min(50, minLeft / rect.width * 100)
  const maxRatio = Math.max(minRatio, maxLeft / rect.width * 100)
  return Math.min(Math.max(ratio, minRatio), maxRatio)
}

ctx.resizeSplitter = function resizeSplitter(e) {
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

ctx.stopSplitResize = function stopSplitResize() {
  if (!splitting) return
  splitting = false
  splitterActive.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeSplitter)
  document.removeEventListener('mouseup', stopSplitResize)
}

ctx.startSplitResize = function startSplitResize(e) {
  if (splitting || (e.button != null && e.button !== 0)) return
  e.preventDefault()
  splitting = true
  splitterActive.value = true
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeSplitter)
  document.addEventListener('mouseup', stopSplitResize)
}

ctx.getWorkspaceElement = function getWorkspaceElement() {
  return document.querySelector('.code-workspace')
}

ctx.resizeExplorer = function resizeExplorer(e) {
  const body = document.querySelector('.coding-body')
  if (!body) return
  const rect = body.getBoundingClientRect()
  const maxWidth = Math.max(140, rect.width - 300)
  const width = Math.min(Math.max(e.clientX - rect.left, 140), maxWidth)
  explorerWidth.value = Math.round(width) + 'px'
  nextTick(() => { if (monacoEditor) monacoEditor.layout() })
}

ctx.stopExplorerResize = function stopExplorerResize() {
  if (!explorerResizing) return
  explorerResizing = false
  explorerSplitterActive.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeExplorer)
  document.removeEventListener('mouseup', stopExplorerResize)
  window.removeEventListener('blur', stopExplorerResize)
  saveExplorerWidth(Number.parseFloat(explorerWidth.value) || 220)
  nextTick(() => { if (monacoEditor) monacoEditor.layout() })
}

ctx.startExplorerResize = function startExplorerResize(e) {
  if (explorerResizing || (e.button != null && e.button !== 0)) return
  e.preventDefault()
  explorerResizing = true
  explorerSplitterActive.value = true
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeExplorer)
  document.addEventListener('mouseup', stopExplorerResize)
  window.addEventListener('blur', stopExplorerResize)
}

ctx.clampConsoleHeight = function clampConsoleHeight(height, rect) {
  const minHeight = 80
  const minTop = 160
  const splitterHeight = 8
  const maxHeight = Math.max(minHeight, rect.height - minTop - splitterHeight)
  return Math.min(Math.max(height, minHeight), maxHeight)
}

ctx.onWorkspaceResize = function onWorkspaceResize() {
  const workspace = getWorkspaceElement()
  if (!workspace) return
  const rect = workspace.getBoundingClientRect()
  if (!rect.height) return
  consoleHeight.value = clampConsoleHeight(loadConsoleHeight(), rect) + 'px'
}

ctx.resizeConsoleSplitter = function resizeConsoleSplitter(e) {
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

ctx.stopConsoleResize = function stopConsoleResize() {
  if (!consoleResizing) return
  consoleResizing = false
  consoleSplitterActive.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', resizeConsoleSplitter)
  document.removeEventListener('mouseup', stopConsoleResize)
}

ctx.startConsoleResize = function startConsoleResize(e) {
  if (consoleResizing || (e.button != null && e.button !== 0)) return
  e.preventDefault()
  consoleResizing = true
  consoleSplitterActive.value = true
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', resizeConsoleSplitter)
  document.addEventListener('mouseup', stopConsoleResize)
}

ctx.toggleConsoleLevel = function toggleConsoleLevel(key, event) {
  const enabled = new Set(consoleLevels.value)
  if (event.target.checked) enabled.add(key)
  else enabled.delete(key)
  consoleLevels.value = LOG_LEVELS.filter(l => enabled.has(l.key)).map(l => l.key)
}

ctx.resetConsoleSettings = function resetConsoleSettings() {
  consoleLevels.value = defaultConsoleLevels()
}

ctx.clampToolbarPosition = function clampToolbarPosition(x, y) {
  const el = toolbarEl.value
  const maxX = Math.max(0, window.innerWidth - (el ? el.offsetWidth : 0))
  const maxY = Math.max(0, window.innerHeight - (el ? el.offsetHeight : 0))
  return {
    x: Math.round(Math.min(Math.max(x, 0), maxX)),
    y: Math.round(Math.min(Math.max(y, 0), maxY)),
  }
}

ctx.onToolbarDragMove = function onToolbarDragMove(e) {
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

ctx.stopToolbarDrag = function stopToolbarDrag() {
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

ctx.startToolbarDrag = function startToolbarDrag(e) {
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

ctx.onToolbarWindowResize = function onToolbarWindowResize() {
  toolbarPos.value = clampToolbarPosition(toolbarPos.value.x, toolbarPos.value.y)
}


}
}
})()
