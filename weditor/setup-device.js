/* WEditor setup module: device connect + hierarchy + tap */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installDevice = function (ctx) {

with (ctx) {
ctx.doConnect = async function doConnect() {
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
    screenReady.value = false
    clearScreenFrame()
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
    if (editor.code.value === '' && !currentFilePath.value) {
      setCode(C.genClearCode(device.platform.value, device.serial.value))
    }
  } catch (e) {
    ElMessage.error('Connect failed: ' + e.message)
  } finally {
    device.connecting.value = false
  }
}

ctx.dumpHierarchy = async function dumpHierarchy() {
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

ctx.treeLabel = function treeLabel(n) {
  if (!n) return ''
  return n.text || n.resourceId || n.description || n._type || n.name || '(node)'
}

ctx.onNodeClick = function onNodeClick(data) {
  if (!data.rect) return
  selectedNode.value = data
  editor.generatedCode.value = C.genSelectorDisplay(data)
}

ctx.doTap = async function doTap() {
  if (!selectedNode.value) return
  const code = editor.generatedCode.value || C.genTouchNode(selectedNode.value)
  if (!code) return
  setCode(code)
  shellRun(code)
}


}
}
})()
