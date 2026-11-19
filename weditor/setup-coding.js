/* WEditor setup module: monaco + coding actions + templates */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installCoding = function (ctx) {

with (ctx) {
ctx.insertSnippet = function insertSnippet(code) {
  if (!monacoEditor) {
    const current = editor.code.value
    const lead = current && !current.endsWith('\n') ? '\n' : ''
    editor.code.value = current + lead + code + '\n'
    return null
  }
  const model = monacoEditor.getModel()
  const selection = monacoEditor.getSelection()
  const startPos = selection.getStartPosition()
  const startText = model.getLineContent(selection.startLineNumber)
  const endText = model.getLineContent(selection.endLineNumber)
  const before = startText.slice(0, Math.max(0, selection.startColumn - 1))
  const after = endText.slice(Math.max(0, selection.endColumn - 1))
  const indent = (startText.match(/^\s*/) || [''])[0]
  const prefix = before.trim() ? '\n' + indent : ''
  const suffix = after.length ? '\n' + indent : ''
  monacoEditor.pushUndoStop()
  monacoEditor.executeEdits('weditor-coding-actions', [{
    range: selection,
    text: prefix + code + suffix,
    forceMoveMarkers: true,
  }])
  monacoEditor.pushUndoStop()
  monacoEditor.focus()
  return { model, startPos, prefix }
}

ctx.screenshotBase64 = function screenshotBase64() {
  const value = screenImg.value
  if (typeof value === 'string' && value.startsWith('data:')) {
    const comma = value.indexOf(',')
    if (comma >= 0) return value.slice(comma + 1)
  }
  return localStorage.getItem('screenshotBase64') || ''
}

ctx.currentScreenshotBase64 = async function currentScreenshotBase64() {
  const img = screenImgEl.value
  if (img && img.complete && img.naturalWidth && img.naturalHeight) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      return canvas.toDataURL('image/jpeg').split(',')[1]
    } catch (e) {}
  }
  return screenshotBase64()
}

ctx.screenshotBounds = function screenshotBounds(bounds) {
  const img = screenImgEl.value
  const size = deviceCoordinateSize.value
  if (!img || !img.naturalWidth || !size || !size.width || !size.height) return bounds
  const sx = img.naturalWidth / size.width
  const sy = img.naturalHeight / size.height
  return bounds.map((value, index) => Math.round(value * (index % 2 === 0 ? sx : sy)))
}

ctx.newlineAfterCommand = function newlineAfterCommand(lineNumber) {
  if (!monacoEditor) return
  const model = monacoEditor.getModel()
  const maxColumn = model.getLineMaxColumn(lineNumber)
  const indent = (model.getLineContent(lineNumber).match(/^\s*/) || [''])[0]
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
    monacoEditor.pushUndoStop()
    monacoEditor.executeEdits('weditor-command-newline', edits)
    monacoEditor.pushUndoStop()
  }
  monacoEditor.setPosition({ lineNumber: lineNumber + 1, column: cursorColumn })
  monacoEditor.focus()
}

ctx.saveTemplateFill = async function saveTemplateFill(bounds) {
  if (!monacoEditor) return
  const actionId = templateFillAction || 'wait'
  if (!templateFillRange) {
    ElMessage.error('模板参数选中状态已失效，请重新点击 ' + actionId)
    clearTemplateFill()
    return
  }
  const range = templateFillRange
  const lineNumber = range.startLineNumber
  templateFillRange = null
  const name = 'temp_' + Date.now()
  try {
    const shot = await currentScreenshotBase64()
    if (!shot) throw new Error('当前截图为空，请先刷新截图')
    const croppedBounds = screenshotBounds(bounds)
    const resp = await fetch('/api/v1/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot: shot,
        bounds: croppedBounds,
        name,
      }),
    }).then(r => r.json())
    if (!resp.success) throw new Error(resp.description || 'save failed')
    monacoEditor.pushUndoStop()
    monacoEditor.executeEdits('weditor-template-fill', [{
      range,
      text: resp.path,
      forceMoveMarkers: true,
    }])
    monacoEditor.pushUndoStop()
    monacoEditor.setPosition({ lineNumber, column: range.startColumn + String(resp.path).length })
    newlineAfterCommand(lineNumber)
    activeSnippet.value = actionId
    loadTemplateAssets()
    ElMessage.success('已保存模板并填充路径')
    logInteraction('模板模式', '框选截图保存并填充 ' + actionId + ' 参数', { name, path: resp.path, bounds })
  } catch (e) {
    ElMessage.error('模板截图保存失败: ' + (e && e.message ? e.message : String(e)))
  } finally {
    clearTemplateFill()
    templateRect.value = null
  }
}

ctx.useAction = function useAction(action) {
  if (!codingMode.value) return
  const templateMode = action.id === 'wait' || action.id === 'exists'
    || (action.id === 'touch' && editor.tapMode.value === 'template')
  if (templateMode && editor.tapMode.value !== 'template') {
    suppressTemplateClear = true
    editor.tapMode.value = 'template'
  }
  const code = templateMode && action.templateCode ? action.templateCode : action.code
  const inserted = insertSnippet(code)
  activeSnippet.value = action.id
  if (templateMode && inserted) {
    clearCoordFill()
    clearTemplateFill()
    const placeholder = 'tpl.png'
    const offset = inserted.model.getOffsetAt(inserted.startPos)
      + inserted.prefix.length + code.indexOf(placeholder)
    const p1 = inserted.model.getPositionAt(offset)
    const p2 = inserted.model.getPositionAt(offset + placeholder.length)
    templateFillRange = {
      startLineNumber: p1.lineNumber,
      startColumn: p1.column,
      endLineNumber: p2.lineNumber,
      endColumn: p2.column,
    }
    templateFillAction = action.id
    monacoEditor.setSelection(templateFillRange)
    monacoEditor.revealRangeInCenter(templateFillRange)
    pendingTemplateFill.value = true
    templateHintText.value = '在 Screen 框选范围后截图保存模板'
    ElMessage({
      message: templateHintText.value,
      type: 'info',
      duration: 4000,
    })
    return
  }
  if (action.id === 'log' && inserted) {
    clearCoordFill()
    clearTemplateFill()
    const placeholder = 'message'
    const offset = inserted.model.getOffsetAt(inserted.startPos)
      + inserted.prefix.length + action.code.indexOf(placeholder)
    const p1 = inserted.model.getPositionAt(offset)
    const p2 = inserted.model.getPositionAt(offset + placeholder.length)
    monacoEditor.setSelection({
      startLineNumber: p1.lineNumber,
      startColumn: p1.column,
      endLineNumber: p2.lineNumber,
      endColumn: p2.column,
    })
    monacoEditor.revealRangeInCenter(monacoEditor.getSelection())
    ElMessage({
      message: '已插入 log 代码，可直接输入日志内容',
      type: 'info',
      duration: 2000,
    })
    return
  }
  const placeholders = action.id === 'touch' ? ['x, y']
    : action.id === 'swipe' ? ['x1, y1', 'x2, y2'] : null
  if (placeholders && editor.tapMode.value === 'coordinate' && inserted) {
    clearCoordFill()
    const baseOffset = inserted.model.getOffsetAt(inserted.startPos) + inserted.prefix.length
    const ranges = placeholders.map((placeholder) => {
      const offset = baseOffset + action.code.indexOf(placeholder)
      const p1 = inserted.model.getPositionAt(offset)
      const p2 = inserted.model.getPositionAt(offset + placeholder.length)
      return {
        startLineNumber: p1.lineNumber,
        startColumn: p1.column,
        endLineNumber: p2.lineNumber,
        endColumn: p2.column,
      }
    })
    coordFillPlan = { kind: action.id, ranges, index: 0 }
    coordFillRange = ranges[0]
    monacoEditor.setSelection(coordFillRange)
    monacoEditor.revealRangeInCenter(coordFillRange)
    pendingCoordHint.value = true
    coordHintText.value = action.id === 'swipe'
      ? '双击 Screen 填充起点 x1, y1（1/2）'
      : '双击 Screen 填充 x, y'
    ElMessage({
      message: coordHintText.value,
      type: 'info',
      duration: 4000,
    })
    return
  }
  clearCoordFill()
  clearTemplateFill()
  ElMessage({
    message: '已插入 ' + action.label + ' 代码',
    type: 'success',
    duration: 1200,
  })
}

ctx.toggleActions = function toggleActions() {
  actionsCollapsed.value = !actionsCollapsed.value
}

ctx.actionGroupName = function actionGroupName(group) {
  return ACTION_GROUP_LABELS[group] || ''
}

ctx.loadTemplateAssets = async function loadTemplateAssets() {
  templateAssetsLoading.value = true
  try {
    const data = await fetch('/api/v1/templates').then(r => r.json())
    if (!data.success) throw new Error(data.description || 'load failed')
    templateAssets.value = data.items || []
  } catch (e) {
    ElMessage.error('资源加载失败: ' + e.message)
  } finally {
    templateAssetsLoading.value = false
  }
}

ctx.deleteTemplateAsset = async function deleteTemplateAsset(item) {
  try {
    const data = await fetch('/api/v1/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: item.filename }),
    }).then(r => r.json())
    if (!data.success) throw new Error(data.description || 'delete failed')
    ElMessage.success('已删除 ' + item.filename)
    await loadTemplateAssets()
  } catch (e) {
    ElMessage.error('删除失败: ' + e.message)
  }
}

ctx.useTemplateAsset = function useTemplateAsset(item) {
  setCode(C.genTemplateTap(item.path))
  ElMessage.success('已插入模板代码')
}

ctx.editorCode = function editorCode() { return monacoEditor ? monacoEditor.getValue() : editor.code.value }

ctx.runCode = function runCode() { const c = editorCode(); if (c) shellRun(c) }
ctx.runSelected = function runSelected() {
  if (!monacoEditor) return runCode()
  const sel = monacoEditor.getModel().getValueInRange(monacoEditor.getSelection())
  shellRun(sel || monacoEditor.getValue())
}
ctx.runCurrentLine = function runCurrentLine() {
  if (!monacoEditor) return runCode()
  const line = monacoEditor.getPosition().lineNumber
  shellRun(monacoEditor.getModel().getLineContent(line))
}

// ---------- Monaco (AMD) ----------
ctx.initMonaco = function initMonaco() {
  return new Promise((resolve) => {
    require.config({ paths: { vs: '/static/vendor/monaco/vs' } })
    require(['vs/editor/editor.main'], function (monaco) {
      monacoEditor = monaco.editor.create(codeContainer.value, {
        value: editor.code.value || C.genClearCode(device.platform.value, device.serial.value),
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
      })
      monacoEditor.onDidChangeModelContent(() => {
        editor.code.value = monacoEditor.getValue()
        markFileDirty()
        if (!coordFillEditing && coordFillRange) clearCoordFill()
        if (templateFillRange) clearTemplateFill()
      })
      monacoEditor.onDidChangeCursorSelection((e) => {
        const s = e.selection
        if (coordFillRange && !coordFillEditing) {
          const r = coordFillRange
          if (s.startLineNumber !== r.startLineNumber || s.startColumn !== r.startColumn
            || s.endLineNumber !== r.endLineNumber || s.endColumn !== r.endColumn) {
            clearCoordFill()
          }
        }
        if (templateFillRange) {
          const r = templateFillRange
          if (s.startLineNumber !== r.startLineNumber || s.startColumn !== r.startColumn
            || s.endLineNumber !== r.endLineNumber || s.endColumn !== r.endColumn) {
            clearTemplateFill()
          }
        }
      })
      monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          }
          return {
            suggestions: C.ANDROID_COMPLETIONS.map(c => ({
              label: c.value.split('(')[0].replace(/[^a-zA-Z_]/g, '') || c.name,
              insertText: c.value,
              kind: monaco.languages.CompletionItemKind.Function,
              detail: 'airtest · ' + c.name,
              filterText: c.value,
              sortText: c.name,
              range,
            })),
          }
        },
      })
      resolve()
    })
  })
}


}
}
})()
