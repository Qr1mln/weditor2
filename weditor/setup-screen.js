/* WEditor setup module: screen geometry utilities */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installScreen = function (ctx) {

with (ctx) {
ctx.fitScreen = function fitScreen() {
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

ctx.parseWindowSize = function parseWindowSize(value) {
  const parts = String(value || '').split(',').map(v => Number(v.trim()))
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null
  if (parts[0] <= 0 || parts[1] <= 0) return null
  return { width: parts[0], height: parts[1] }
}

ctx.refreshDeviceSize = async function refreshDeviceSize() {
  const id = encodeURIComponent(device.deviceId.value)
  const v2 = await fetch(`/api/v2/devices/${id}/hierarchy`).then(r => r.json())
  deviceCoordinateSize.value = parseWindowSize(v2.windowSize)
}

ctx.toDevicePoint = function toDevicePoint(e) {
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

ctx.updateCursor = function updateCursor(e) {
  const img = screenImgEl.value
  const point = toDevicePoint(e)
  if (!img || !point) return
  cursorPoint.value = point
  const rect = img.getBoundingClientRect()
  const left = Math.min(Math.max(e.clientX - rect.left + 10, 4), Math.max(4, rect.width - 72))
  const top = Math.min(Math.max(e.clientY - rect.top - 26, 4), Math.max(4, rect.height - 24))
  coordTipStyle.value = { left: left + 'px', top: top + 'px' }
}

ctx.clearCursor = function clearCursor() {
  cursorPoint.value = null
}

ctx.logInteraction = function logInteraction(tag, message, detail) {
  if (detail === undefined) console.log(`[${tag}] ${message}`)
  else console.log(`[${tag}] ${message}`, detail)
}

ctx.toFramePoint = function toFramePoint(e) {
  const img = screenImgEl.value
  if (!img) return null
  const rect = img.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
  }
}

ctx.updateTemplateSelection = function updateTemplateSelection(e, startFrame) {
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


}
}
})()
