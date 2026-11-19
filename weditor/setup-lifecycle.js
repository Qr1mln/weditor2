/* WEditor setup module: watchers + lifecycle */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installLifecycle = function (ctx) {

with (ctx) {
let debugLineDecorations = []
const clearDebugLineDecoration = () => {
  if (monacoEditor && debugLineDecorations.length) {
    debugLineDecorations = monacoEditor.deltaDecorations(debugLineDecorations, [])
  } else {
    debugLineDecorations = []
  }
}

watch(shell.lastLineno, (n) => {
  clearDebugLineDecoration()
  if (!shell.debugMode.value || monacoEditor == null || n == null) return
  const line = Math.max(1, Number(n) || 1)
  monacoEditor.revealLineInCenter(line)
  monacoEditor.setPosition({ lineNumber: line, column: 1 })
  debugLineDecorations = monacoEditor.deltaDecorations(debugLineDecorations, [{
    range: {
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1,
    },
    options: {
      isWholeLine: true,
      className: 'weditor-debug-line',
    },
  }])
})

watch(shell.debugMode, (on) => {
  if (!on) shell.lastLineno.value = null
})

watch(rightTab, (tab) => {
  nextTick(() => { if (monacoEditor) monacoEditor.layout() })
  if (tab === 'assets') loadTemplateAssets()
})

// 自动连接：开关打开且连接地址非空时才触发，避免连接中重复请求。
ctx.maybeAutoConnect = function maybeAutoConnect(reason) {
  if (!device.autoConnect.value || device.connecting.value) return
  if (!String(device.serial.value || '').trim()) return
  console.info('[auto-connect] ' + reason + ': ' + device.serial.value)
  ctx.doConnect()
}
watch(device.autoConnect, (on) => {
  if (on) ctx.maybeAutoConnect('switch on')
})

onMounted(async () => {
  fetchVersion()
  loadProjectInfo()
  const treePromise = loadServerTree()
  await nextTick()
  toolbarPos.value = clampToolbarPosition(toolbarPos.value.x, toolbarPos.value.y)
  const main = getMainElement()
  if (main) {
    const rect = main.getBoundingClientRect()
    if (rect.width) screenPaneWidth.value = clampSplitRatio(loadSplitRatio(), rect).toFixed(2) + '%'
  }
  onWorkspaceResize()
  await initMonaco()
  window.addEventListener('keydown', onGlobalKeydown)
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
  await treePromise
  await ctx.restoreLastFile()
  ctx.maybeAutoConnect('startup')
})
onBeforeUnmount(() => {
  stopSplitResize()
  stopConsoleResize()
  stopExplorerResize()
  stopToolbarDrag()
  closeMinicap()
  removeGestureListeners()
  if (workspaceObserver) workspaceObserver.disconnect()
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('resize', fitScreen)
  window.removeEventListener('resize', onWorkspaceResize)
  window.removeEventListener('resize', onToolbarWindowResize)
})

}
}
})()
