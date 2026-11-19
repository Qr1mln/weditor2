/* WEditor setup module: minicap streaming */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installMinicap = function (ctx) {

with (ctx) {
ctx.closeMinicap = function closeMinicap() {
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
  minicapPendingFrame = null
  minicapFrameScheduled = false
  minicapDrawing = false
  minicapConnecting.value = false
}

// 背压：WS 每帧只覆盖 pending，绘制由 rAF 驱动；同一时刻只解码绘制一帧，慢设备自动丢掉过期帧。
ctx.pumpMinicapFrame = function pumpMinicapFrame() {
  if (minicapFrameScheduled || minicapDrawing || minicapPendingFrame === null) return
  minicapFrameScheduled = true
  window.requestAnimationFrame(async () => {
    minicapFrameScheduled = false
    const frame = minicapPendingFrame
    minicapPendingFrame = null
    if (frame === null || screenMode.value !== 'minicap') return
    minicapDrawing = true
    try {
      const ok = await drawScreenFrame(frame)
      if (ok) screenReady.value = true
    } finally {
      minicapDrawing = false
      if (minicapPendingFrame !== null) pumpMinicapFrame()
    }
  })
}

ctx.applyMinicapFrame = function applyMinicapFrame(data) {
  minicapPendingFrame = data
  pumpMinicapFrame()
}

ctx.connectMinicap = function connectMinicap() {
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

ctx.setScreenMode = function setScreenMode(mode) {
  if (screenMode.value === mode) return
  screenMode.value = mode
  saveScreenMode(mode)
}

ctx.toggleScreenMode = async function toggleScreenMode() {
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

ctx.refreshScreenshotFromToolbar = async function refreshScreenshotFromToolbar() {
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

ctx.sendToolbarKey = function sendToolbarKey(key) {
  if (suppressToolbarClick) return
  if (!device.deviceId.value) return ElMessage.warning('Connect first')
  logInteraction('悬浮工具栏', '下发按键', key)
  runScreenGesture({ action: 'keyevent', key })
}


}
}
})()
