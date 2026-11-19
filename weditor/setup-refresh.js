/* WEditor setup module: screenshot refresh */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installRefresh = function (ctx) {

with (ctx) {

ctx.refreshScreenshot = async function refreshScreenshot() {
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
  const bytes = Uint8Array.from(atob(shot.data), c => c.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'image/' + (shot.type || 'jpeg') })
  const ok = await drawScreenFrame(blob)
  screenImg.value = 'data:image/' + (shot.type || 'jpeg') + ';base64,' + shot.data
  screenReady.value = !!ok
  try {
    localStorage.setItem('screenshotBase64', shot.data)
  } catch (e) {
    console.warn('[screen] cache screenshot failed', e)
  }
  await nextTick()
  fitScreen()
}


}
}
})()
