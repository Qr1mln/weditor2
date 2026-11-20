/* WEditor setup module: screen gestures + command state cleanup */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installGestures = function (ctx) {

with (ctx) {
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
    return
  }

  // 插入坐标命令：双击 Screen 取坐标，直接插入到编辑器当前光标位置。
  if (activeCommand.value === 'coord') {
    if (distance > 16) {
      lastProgramTap = null
      return
    }
    const now = Date.now()
    const isDoubleTap = lastProgramTap
      && now - lastProgramTap.time <= DOUBLE_TAP_MS
      && Math.hypot(e.clientX - lastProgramTap.x, e.clientY - lastProgramTap.y) <= DOUBLE_TAP_DISTANCE
    if (!isDoubleTap) {
      lastProgramTap = { time: now, x: e.clientX, y: e.clientY }
      return
    }
    lastProgramTap = null
    const text = `(${start.x}, ${start.y})`
    logInteraction('命令工具栏', '获取坐标', { x: start.x, y: start.y, text })
    if (monacoEditor) {
      const selection = monacoEditor.getSelection()
      const model = monacoEditor.getModel()
      if (selection && model) {
        const range = {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn,
        }
        coordFillEditing = true
        monacoEditor.pushUndoStop()
        monacoEditor.executeEdits('weditor-coord-replace', [{
          range,
          text,
          forceMoveMarkers: true,
        }])
        monacoEditor.pushUndoStop()
        coordFillEditing = false
        monacoEditor.setPosition({
          lineNumber: range.startLineNumber,
          column: range.startColumn + text.length,
        })
        monacoEditor.focus()
      }
    } else {
      editor.code.value += text
    }
    logInteraction('命令工具栏', '双击 Screen 获取坐标并替换选中内容', { x: start.x, y: start.y, text })
    clearActiveCommand()
    return
  }

  // 命令处于选中状态：Screen 鼠标只用于给已插入的代码填充坐标参数。
  if (activeCommand.value === 'touch' || activeCommand.value === 'swipe') {
    if (distance > 16) {
      lastProgramTap = null
      return
    }
    const now = Date.now()
    const isDoubleTap = lastProgramTap
      && now - lastProgramTap.time <= DOUBLE_TAP_MS
      && Math.hypot(e.clientX - lastProgramTap.x, e.clientY - lastProgramTap.y) <= DOUBLE_TAP_DISTANCE
    if (!isDoubleTap) {
      lastProgramTap = { time: now, x: e.clientX, y: e.clientY }
      if (coordFillRange) {
        logInteraction('命令工具栏', '等待双击（第二次点击后填充坐标）', { x: start.x, y: start.y })
      }
      return
    }
    lastProgramTap = null
    logInteraction('命令工具栏', '获取坐标', { x: start.x, y: start.y })
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
      logInteraction('命令工具栏', '双击 Screen 填充坐标并换行', { x: start.x, y: start.y, text, steps: total })
      clearActiveCommand()
    }
    return
  }

  // 无命令选中：Screen 默认鼠标事件（点击 tap / 拖拽 swipe）。
  if (distance <= 16) {
    logInteraction('Screen', '点击 → tap', { x: start.x, y: start.y })
    runScreenGesture({ action: 'tap', x: start.x, y: start.y })
  } else {
    logInteraction('Screen', '拖拽 → swipe', {
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
}

ctx.onScreenMouseDown = function onScreenMouseDown(e) {
  if (e.button !== 0) return
  const mode = activeMode.value
  const point = toDevicePoint(e)
  if (!point) return
  e.preventDefault()
  screenGesture = { start: point, mode, startFrame: toFramePoint(e) }
  logInteraction('Screen', '点击', { command: activeCommand.value || '默认', mode: MODE_LABELS[mode], point })
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

ctx.onGlobalKeydown = function onGlobalKeydown(e) {
  if (e.key !== 'Escape' || !activeCommand.value) return
  e.preventDefault()
  logInteraction('命令工具栏', 'ESC 取消选中', { command: activeCommand.value })
  clearActiveCommand()
}

}
}
})()
