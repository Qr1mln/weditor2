/* WEditor setup module: gestures + mode watch */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installGestures = function (ctx) {

with (ctx) {
watch(activeMode, (next, prev) => {
  logInteraction('模式切换', `${MODE_LABELS[prev]} → ${MODE_LABELS[next]}`, { mode: next })
  screenGesture = null
  lastProgramTap = null
  clearCoordFill()
  if (suppressTemplateClear) suppressTemplateClear = false
  else clearTemplateFill()
  removeGestureListeners()
  clearCursor()
  templateRect.value = null
  logInteraction('模板模式', '边框渲染（清除：等待左键拖拽绘制）')
})

ctx.runScreenGesture = async function runScreenGesture(payload) {
  if (!device.deviceId.value) return
  const id = encodeURIComponent(device.deviceId.value)
  try {
    const response = await fetch(`/api/v1/devices/${id}/gesture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let result = null
    try {
      result = await response.json()
    } catch (e) {
      throw new Error(`Invalid gesture response (HTTP ${response.status})`)
    }
    if (!response.ok || !result.success) {
      throw new Error(result.description || `HTTP ${response.status}`)
    }
  } catch (e) {
    ElMessage.error('Screen gesture failed: ' + (e && e.message ? e.message : String(e)))
  }
}

ctx.removeGestureListeners = function removeGestureListeners() {
  document.removeEventListener('mousemove', onGestureMove)
  document.removeEventListener('mouseup', onGestureUp)
}

ctx.onGestureMove = function onGestureMove(e) {
  if (!screenGesture) return
  if (screenGesture.mode === 'template') updateTemplateSelection(e, screenGesture.startFrame)
  else updateCursor(e)
}

ctx.onGestureUp = function onGestureUp(e) {
  if (!screenGesture) return
  removeGestureListeners()
  const gesture = screenGesture
  const start = gesture.start
  const end = toDevicePoint(e) || start
  screenGesture = null
  if (e.target !== screenImgEl.value) clearCursor()
  const dx = end.x - start.x
  const dy = end.y - start.y
  const distance = Math.sqrt(dx * dx + dy * dy)

  if (gesture.mode === 'operate') {
    if (distance <= 16) {
      logInteraction('操作模式', '点击 Screen，下发 tap', { x: start.x, y: start.y })
      runScreenGesture({ action: 'tap', x: start.x, y: start.y })
    } else {
      logInteraction('操作模式', '滑动 Screen，下发 swipe', {
        x1: start.x, y1: start.y, x2: end.x, y2: end.y, duration: 0.5,
      })
      runScreenGesture({
        action: 'swipe',
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        duration: 0.5,
      })
    }
    return
  }

  if (gesture.mode === 'program') {
    if (distance > 16) {
      logInteraction('编程模式', '检测到滑动，编程模式仅响应点击（已忽略）', {
        from: start, to: end,
      })
      return
    }
    const now = Date.now()
    const isDoubleTap = lastProgramTap
      && now - lastProgramTap.time <= DOUBLE_TAP_MS
      && Math.hypot(e.clientX - lastProgramTap.x, e.clientY - lastProgramTap.y) <= DOUBLE_TAP_DISTANCE
    if (!isDoubleTap) {
      lastProgramTap = { time: now, x: e.clientX, y: e.clientY }
      logInteraction('编程模式', '等待双击（第二次点击后插入代码）', { x: start.x, y: start.y })
      return
    }
    lastProgramTap = null
    logInteraction('编程模式', '获取坐标', { x: start.x, y: start.y })
    if (coordFillRange && monacoEditor) {
      const plan = coordFillPlan
      const range = coordFillRange
      coordFillRange = null
      const stepIndex = plan ? plan.index : 0
      const total = plan ? plan.ranges.length : 1
      const text = `${start.x}, ${start.y}`
      const model = monacoEditor.getModel()
      const lineNumber = range.startLineNumber
      const delta = text.length - (range.endColumn - range.startColumn)
      if (plan && stepIndex < total - 1) {
        for (let i = stepIndex + 1; i < total; i += 1) {
          plan.ranges[i].startColumn += delta
          plan.ranges[i].endColumn += delta
        }
      }
      coordFillEditing = true
      monacoEditor.pushUndoStop()
      monacoEditor.executeEdits('weditor-coord-fill', [{
        range,
        text,
        forceMoveMarkers: true,
      }])
      monacoEditor.pushUndoStop()
      coordFillEditing = false
      if (plan && stepIndex < total - 1) {
        plan.index += 1
        coordFillRange = plan.ranges[plan.index]
        coordHintText.value = `双击 Screen 填充终点 x2, y2（${plan.index + 1}/${total}）`
        monacoEditor.setSelection(coordFillRange)
        monacoEditor.revealRangeInCenter(coordFillRange)
        monacoEditor.focus()
        ElMessage({ message: coordHintText.value, type: 'info', duration: 3000 })
        logInteraction('编程模式', '双击 Screen 填充起点 x1, y1（1/2）', { x: start.x, y: start.y })
        return
      }
      const maxColumn = model.getLineMaxColumn(lineNumber)
      const indent = (model.getLineContent(lineNumber).match(/^\s*/) || [''])[0]
      monacoEditor.setPosition({ lineNumber, column: maxColumn })
      const edits = []
      let cursorColumn
      if (lineNumber < model.getLineCount()) {
        cursorColumn = ((model.getLineContent(lineNumber + 1).match(/^\s*/) || [''])[0]).length + 1
      } else {
        edits.push({
          range: {
            startLineNumber: lineNumber,
            startColumn: maxColumn,
            endLineNumber: lineNumber,
            endColumn: maxColumn,
          },
          text: '\n' + indent,
          forceMoveMarkers: true,
        })
        cursorColumn = indent.length + 1
      }
      if (edits.length) {
        coordFillEditing = true
        monacoEditor.pushUndoStop()
        monacoEditor.executeEdits('weditor-coord-newline', edits)
        monacoEditor.pushUndoStop()
        coordFillEditing = false
      }
      monacoEditor.setPosition({ lineNumber: lineNumber + 1, column: cursorColumn })
      monacoEditor.focus()
      activeSnippet.value = plan ? plan.kind : 'touch'
      logInteraction('编程模式', '双击 Screen 填充坐标并换行', {
        x: start.x, y: start.y, text,
        steps: total,
      })
      clearCoordFill()
      return
    }
    const code = C.genTouch(start.x, start.y)
    const inserted = insertAtCursor(code)
    logInteraction('编程模式', '双击插入坐标代码到 Coding 当前位置', {
      code, inserted,
      cursor: monacoEditor ? monacoEditor.getPosition() : null,
    })
    return
  }

  if (gesture.mode === 'template') {
    const hasDrag = Math.abs(end.x - start.x) >= 2 || Math.abs(end.y - start.y) >= 2
    const now = Date.now()
    const isDoubleTap = !hasDrag && lastTemplateTap
      && now - lastTemplateTap.time <= DOUBLE_TAP_MS
      && Math.hypot(e.clientX - lastTemplateTap.x, e.clientY - lastTemplateTap.y) <= DOUBLE_TAP_DISTANCE
    lastTemplateTap = hasDrag ? null : { time: now, x: e.clientX, y: e.clientY }
    if (templateBounds && isDoubleTap) {
      const bounds = templateBounds
      templateBounds = null
      saveTemplateFill(bounds)
      return
    }
    if (hasDrag) {
      const rect = updateTemplateSelection(e, gesture.startFrame)
      logInteraction('模板模式', '框选完成', { deviceStart: start, deviceEnd: end })
      logInteraction('模板模式', '边框渲染（完成）', rect)
      if (pendingTemplateFill.value) {
        templateBounds = [
          Math.min(start.x, end.x),
          Math.min(start.y, end.y),
          Math.max(start.x, end.x),
          Math.max(start.y, end.y),
        ]
        templateHintText.value = '双击 Screen 确认保存模板'
        ElMessage({ message: templateHintText.value, type: 'info', duration: 4000 })
      }
    }
  }
}

ctx.onScreenMouseDown = function onScreenMouseDown(e) {
  if (e.button !== 0) return
  const mode = activeMode.value
  const point = toDevicePoint(e)
  if (!point) return
  if (mode === 'operate' && !device.deviceId.value) return
  e.preventDefault()
  screenGesture = { start: point, mode, startFrame: toFramePoint(e) }
  logInteraction('Screen', '点击', { mode: MODE_LABELS[mode], point })
  if (mode === 'template') {
    logInteraction('模板模式', '开始框选（按住左键拖拽绘制）', screenGesture.startFrame)
  }
  updateCursor(e)
  removeGestureListeners()
  document.addEventListener('mousemove', onGestureMove)
  document.addEventListener('mouseup', onGestureUp)
}

ctx.onScreenMouseMove = function onScreenMouseMove(e) {
  if (!screenGesture) updateCursor(e)
}

ctx.onScreenMouseLeave = function onScreenMouseLeave() {
  if (!screenGesture) clearCursor()
}

}
}
})()
