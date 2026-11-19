/* WEditor setup module: watchers + lifecycle */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installLifecycle = function (ctx) {

with (ctx) {
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

}
}
})()
