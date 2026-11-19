/* WEditor setup module: screen geometry utilities */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installScreen = function (ctx) {

with (ctx) {
ctx.fitScreen = function fitScreen() {
  const area = screenAreaEl.value
  const canvas = screenImgEl.value
  if (!area || !canvas || !canvas.width || !canvas.height) return
  screenshotSize.value = { width: canvas.width, height: canvas.height }
  const aw = area.clientWidth
  const ah = area.clientHeight
  if (!aw || !ah) return
  const ratio = canvas.width / canvas.height
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
  zoomPercent.value = Math.round((w / canvas.width) * 100)
}

// 把一帧 JPEG（Blob / ArrayBuffer / {data,type} JSON）解码后画到 Screen canvas。
// createImageBitmap 在浏览器侧解码，避免每帧改 img.src 触发的重复布局与对象 URL 生命周期管理。
ctx.drawScreenFrame = async function drawScreenFrame(data) {
  let blob = null
  if (data instanceof Blob) {
    blob = data
  } else if (data instanceof ArrayBuffer) {
    blob = new Blob([data], { type: 'image/jpeg' })
  } else if (typeof data === 'string') {
    try {
      const msg = JSON.parse(data)
      if (!msg.data) return false
      const bytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0))
      blob = new Blob([bytes], { type: 'image/' + (msg.type || 'jpeg') })
    } catch (e) {
      return false
    }
  }
  if (!blob) return false
  const canvas = screenImgEl.value
  if (!canvas) return false
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch (e) {
    console.warn('[screen] frame decode failed', e)
    return false
  }
  if (screenImgEl.value !== canvas) {
    bitmap.close()
    return false
  }
  const changed = canvas.width !== bitmap.width || canvas.height !== bitmap.height
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close()
  if (changed) fitScreen()
  return true
}

ctx.clearScreenFrame = function clearScreenFrame() {
  const canvas = screenImgEl.value
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
  screenshotSize.value = null
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
  const canvas = screenImgEl.value
  if (!canvas || !canvas.width || !canvas.height) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const size = deviceCoordinateSize.value || { width: canvas.width, height: canvas.height }
  const x = Math.round((e.clientX - rect.left) * size.width / rect.width)
  const y = Math.round((e.clientY - rect.top) * size.height / rect.height)
  return {
    x: Math.max(0, Math.min(x, size.width - 1)),
    y: Math.max(0, Math.min(y, size.height - 1)),
  }
}

ctx.updateCursor = function updateCursor(e) {
  const canvas = screenImgEl.value
  const point = toDevicePoint(e)
  if (!canvas || !point) return
  cursorPoint.value = point
  const rect = canvas.getBoundingClientRect()
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
  const canvas = screenImgEl.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
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
