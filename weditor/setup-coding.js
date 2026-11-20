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
  const source = screenImgEl.value
  if (source && source.width && source.height) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = source.width
      canvas.height = source.height
      canvas.getContext('2d').drawImage(source, 0, 0)
      return canvas.toDataURL('image/jpeg').split(',')[1]
    } catch (e) {}
  }
  return screenshotBase64()
}

ctx.screenshotBounds = function screenshotBounds(bounds) {
  const canvas = screenImgEl.value
  const size = deviceCoordinateSize.value
  if (!canvas || !canvas.width || !size || !size.width || !size.height) return bounds
  const sx = canvas.width / size.width
  const sy = canvas.height / size.height
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
  const replaceSelection = actionId === 'template'
  const selection = replaceSelection ? monacoEditor.getSelection() : null
  const selectionRange = selection ? {
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.endColumn,
  } : null
  const targetRange = replaceSelection ? selectionRange : templateFillRange
  if (!targetRange) {
    ElMessage.error('模板参数选中状态已失效，请重新点击 ' + actionId)
    clearActiveCommand()
    return
  }
  const lineNumber = targetRange.startLineNumber
  templateFillRange = null
  const name = 'temp_' + Date.now()
  try {
    const shot = await currentScreenshotBase64()
    if (!shot) throw new Error('当前截图为空，请先刷新截图')
    const croppedBounds = screenshotBounds(bounds)
    const resp = await fetch('/api/v1/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ screenshot: shot, bounds: croppedBounds, name }),
    }).then(r => r.json())
    if (!resp.success) throw new Error(resp.description || 'save failed')
    coordFillEditing = true
    monacoEditor.pushUndoStop()
    monacoEditor.executeEdits('weditor-template-fill', [{
      range: targetRange,
      text: resp.path,
      forceMoveMarkers: true,
    }])
    monacoEditor.pushUndoStop()
    coordFillEditing = false
    monacoEditor.setPosition({
      lineNumber: targetRange.startLineNumber,
      column: targetRange.startColumn + String(resp.path).length,
    })
    if (!replaceSelection) newlineAfterCommand(lineNumber)
    loadTemplateAssets()
    ElMessage.success(replaceSelection ? '已保存模板并替换选中内容' : '已保存模板并填充路径')
    logInteraction('模板模式', replaceSelection
      ? '框选截图保存并替换选中内容'
      : '框选截图保存并填充 ' + actionId + ' 参数', { name, path: resp.path, bounds })
  } catch (e) {
    ElMessage.error('模板截图保存失败: ' + (e && e.message ? e.message : String(e)))
  } finally {
    coordFillEditing = false
    clearActiveCommand()
    templateRect.value = null
  }
}

ctx.useAction = function useAction(action) {
  if (action.id === 'coord') {
    activeSnippet.value = action.id
    activeCommand.value = action.id
    clearCoordFill()
    clearTemplateFill()
    pendingCoordHint.value = true
    coordHintText.value = '双击 Screen 获取坐标，替换当前选中内容'
    logInteraction('命令工具栏', '启用插入坐标（等待双击 Screen）')
    ElMessage({ message: coordHintText.value, type: 'info', duration: 4000 })
    return
  }
  if (action.id === 'template') {
    activeSnippet.value = action.id
    activeCommand.value = action.id
    clearCoordFill()
    clearTemplateFill()
    pendingTemplateFill.value = true
    templateFillAction = action.id
    templateHintText.value = '在 Screen 框选范围后双击确认保存模板'
    logInteraction('命令工具栏', '启用插入模板（等待框选 Screen）')
    ElMessage({ message: templateHintText.value, type: 'info', duration: 4000 })
    return
  }
  const templateMode = action.id === 'touchTemplate' || action.id === 'wait' || action.id === 'exists'
  const code = templateMode && action.templateCode ? action.templateCode : action.code
  const inserted = insertSnippet(code)
  activeSnippet.value = action.id
  activeCommand.value = action.id
  logInteraction('命令工具栏', `插入 ${action.name} 代码`, { code, mode: templateMode ? 'template' : 'operate' })

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
    ElMessage({ message: templateHintText.value, type: 'info', duration: 4000 })
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
    ElMessage({ message: '已插入 log 代码，可直接输入日志内容', type: 'info', duration: 2000 })
    clearActiveCommand()
    return
  }
  const placeholders = action.id === 'touch' ? ['x, y']
    : action.id === 'swipe' ? ['x1, y1', 'x2, y2'] : null
  if (placeholders && inserted) {
    clearCoordFill()
    clearTemplateFill()
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
    ElMessage({ message: coordHintText.value, type: 'info', duration: 4000 })
    return
  }
  clearCoordFill()
  clearTemplateFill()
  ElMessage({ message: '已插入 ' + action.label + ' 代码', type: 'success', duration: 1200 })
  clearActiveCommand()
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
ctx.installSuggestHover = function installSuggestHover(editor) {
  const tip = document.createElement('div')
  tip.className = 'weditor-suggest-tip'
  tip.style.display = 'none'
  document.body.appendChild(tip)

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))
  }
  function renderDoc(doc) {
    return String(doc).split('\n').map(raw => {
      let line = escapeHtml(raw)
      if (/^\*\*.+\*\*$/.test(line)) line = '<strong>' + line.slice(2, -2) + '</strong>'
      else line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      line = line.replace(/`([^`]+)`/g, '<code>$1</code>')
      if (/^\s*-\s+/.test(raw)) line = '<span class="tip-bullet">• </span>' + line.replace(/^\s*-\s+/, '')
      if (!line.trim()) line = '&nbsp;'
      return '<div class="tip-line">' + line + '</div>'
    }).join('')
  }
  function hide() {
    tip.style.display = 'none'
    lastRow = null
  }
  function show(row, doc) {
    tip.innerHTML = renderDoc(doc)
    tip.style.display = 'block'
    const widget = row.closest('.suggest-widget') || row.parentElement
    const wr = widget.getBoundingClientRect()
    const tr = tip.getBoundingClientRect()
    const m = 8
    let left = wr.right + m
    if (left + tr.width > window.innerWidth - m) left = wr.left - tr.width - m
    if (left < m) left = Math.max(m, Math.min(left, window.innerWidth - tr.width - m))
    let top = wr.top
    if (top + tr.height > window.innerHeight - m) top = Math.max(m, window.innerHeight - tr.height - m)
    tip.style.left = Math.round(left) + 'px'
    tip.style.top = Math.round(top) + 'px'
  }

  let lastRow = null
  document.addEventListener('mouseover', (e) => {
    const t = e.target
    const row = t && t.closest ? t.closest('.suggest-widget .monaco-list-row') : null
    const nativeDetails = document.querySelector('.suggest-details')
    if (!row || row === lastRow || (nativeDetails && nativeDetails.getBoundingClientRect().width > 0)) {
      if (!row) hide()
      return
    }
    lastRow = row
    const detailEl = row.querySelector('.details-label')
    const detail = detailEl ? detailEl.textContent.trim() : ''
    const item = (C.COMPLETIONS || []).find(c => c.detail === detail)
    const doc = item && item.doc
    if (!doc) { hide(); return }
    show(row, doc)
  })
  document.addEventListener('mousedown', hide)
  window.addEventListener('scroll', hide, true)
  if (editor && editor.onDidBlurEditorWidget) editor.onDidBlurEditorWidget(hide)
}

ctx.installTemplatePreview = function installTemplatePreview(editor) {
  const panel = document.createElement('div')
  panel.className = 'weditor-template-preview'
  panel.style.display = 'none'
  const img = document.createElement('img')
  img.alt = ''
  const caption = document.createElement('div')
  caption.className = 'template-preview-caption'
  panel.appendChild(img)
  panel.appendChild(caption)
  document.body.appendChild(panel)

  const cache = new Map()
  let hoverRange = null
  let lastPoint = null
  let loadToken = 0

  function hide() {
    loadToken++
    panel.style.display = 'none'
    hoverRange = null
    lastPoint = null
  }

  function showAt(x, y) {
    panel.style.display = 'block'
    const rect = panel.getBoundingClientRect()
    const m = 8
    const gap = 14
    let left = x + gap
    let top = y + gap
    if (left + rect.width > window.innerWidth - m) left = x - rect.width - gap
    if (top + rect.height > window.innerHeight - m) top = y - rect.height - gap
    left = Math.max(m, Math.min(left, window.innerWidth - rect.width - m))
    top = Math.max(m, Math.min(top, window.innerHeight - rect.height - m))
    panel.style.left = Math.round(left) + 'px'
    panel.style.top = Math.round(top) + 'px'
  }

  img.onload = () => {
    if (panel.style.display === 'block' && lastPoint) showAt(lastPoint.x, lastPoint.y)
  }

  function load(path) {
    const filename = String(path).split(/[\\/]/).pop() || ''
    const asset = (templateAssets.value || []).find(a => a.path === path || a.filename === filename)
    const url = (asset && asset.url) || (filename ? '/widgets/templates/' + encodeURIComponent(filename) : '')
    if (!url) return Promise.resolve(null)
    return new Promise(resolve => {
      const probe = new Image()
      probe.onload = () => resolve({ url, filename, size: asset && asset.size })
      probe.onerror = () => resolve(null)
      probe.src = url
    })
  }

  function prepare(path) {
    if (!cache.has(path)) cache.set(path, load(path))
    return cache.get(path)
  }

  function findPathAt(line, column) {
    const re = /Template\s*\(\s*(['"])(.*?)\1/g
    let match
    while ((match = re.exec(line)) !== null) {
      const quote = match[1]
      const path = match[2]
      const start = match.index + match[0].indexOf(quote) + 1
      const startColumn = start + 1
      const endColumn = start + path.length + 1
      if (path && column >= startColumn && column <= endColumn) {
        return { path, startColumn, endColumn }
      }
    }
    return null
  }

  editor.onMouseMove((e) => {
    const browserEvent = e.event && e.event.browserEvent
    const pos = e.target && e.target.position
    if (!browserEvent || !pos) {
      hide()
      return
    }
    const model = editor.getModel()
    if (!model) { hide(); return }
    const found = findPathAt(model.getLineContent(pos.lineNumber), pos.column)
    if (!found) { hide(); return }
    lastPoint = { x: browserEvent.clientX, y: browserEvent.clientY }
    if (hoverRange && hoverRange.lineNumber === pos.lineNumber
      && hoverRange.startColumn === found.startColumn
      && hoverRange.endColumn === found.endColumn) {
      if (panel.style.display === 'block') showAt(lastPoint.x, lastPoint.y)
      return
    }
    hoverRange = {
      lineNumber: pos.lineNumber,
      startColumn: found.startColumn,
      endColumn: found.endColumn,
    }
    const token = ++loadToken
    prepare(found.path).then((data) => {
      if (token !== loadToken) return
      if (!data) { hide(); return }
      img.src = data.url
      caption.textContent = data.filename
        + (data.size ? '  ·  ' + (data.size / 1024).toFixed(1) + ' KB' : '')
      showAt(lastPoint.x, lastPoint.y)
    })
  })
  editor.onMouseLeave(hide)
  editor.onDidChangeModelContent(hide)
  document.addEventListener('mousedown', hide)
  window.addEventListener('scroll', hide, true)
}

ctx.installTemplateInlineImages = function installTemplateInlineImages(editor, internals) {
  const STORAGE_KEY = 'weditor.templateInlineImages'
  const POSITION_KEY = 'weditor.templateInlineImagesPosition'
  const COMMAND_ID = 'weditor.toggleTemplateInlineImages'
  const CONTEXT_KEY = 'weditor.templateInlineImages'
  const COMMAND_BELOW = 'weditor.templateImagesBelow'
  const COMMAND_ABOVE = 'weditor.templateImagesAbove'
  const COMMAND_END = 'weditor.templateImagesEnd'
  const POSITION_BELOW_KEY = 'weditor.templateImagesBelow'
  const POSITION_ABOVE_KEY = 'weditor.templateImagesAbove'
  const POSITION_END_KEY = 'weditor.templateImagesEnd'
  const SIZE_KEY = 'weditor.templateImagesSize'
  const SIZE_COMMAND_PREFIX = 'weditor.templateImagesSize.'
  const SIZE_POSITION_KEY_PREFIX = 'weditor.templateImagesSizeActive.'
  const SIZE_SCALES = [1, 2, 3, 5]
  const VALID_POSITIONS = ['below', 'above', 'end']
  let enabled = localStorage.getItem(STORAGE_KEY) !== '0'
  const savedPosition = localStorage.getItem(POSITION_KEY)
  let position = VALID_POSITIONS.includes(savedPosition) ? savedPosition : 'end'
  const savedScale = Number(localStorage.getItem(SIZE_KEY))
  let sizeScale = SIZE_SCALES.includes(savedScale) ? savedScale : 1
  let zoneIds = []
  let widgets = []
  let refreshTimer = null
  let rebuildToken = 0
  let enabledContextKey = null
  let positionBelowContextKey = null
  let positionAboveContextKey = null
  let positionEndContextKey = null
  const sizeContextKeys = {}

  function templateTargets() {
    const model = editor.getModel()
    if (!model) return []
    const re = /Template\s*\(\s*(['"])(.*?)\1/g
    const seenLines = new Set()
    const targets = []
    for (let line = 1; line <= model.getLineCount(); line++) {
      const text = model.getLineContent(line)
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        if (!match[2] || seenLines.has(line)) continue
        seenLines.add(line)
        targets.push({ path: match[2], lineNumber: line })
      }
    }
    return targets
  }

  function resolveUrl(path) {
    const filename = String(path).split(/[\\/]/).pop() || ''
    const asset = (templateAssets.value || []).find(a => a.path === path || a.filename === filename)
    return (asset && asset.url) || (filename ? '/widgets/templates/' + encodeURIComponent(filename) : '')
  }

  function clearAll() {
    const ids = zoneIds.slice()
    zoneIds = []
    if (ids.length) {
      editor.changeViewZones(accessor => {
        ids.forEach(id => accessor.removeZone(id))
      })
    }
    const currentWidgets = widgets.slice()
    widgets = []
    currentWidgets.forEach(widget => editor.removeContentWidget(widget))
  }

  function loadImage(url) {
    return new Promise(resolve => {
      const probe = new Image()
      probe.onload = () => resolve({ url: url, height: probe.naturalHeight, width: probe.naturalWidth })
      probe.onerror = () => resolve(null)
      probe.src = url
    })
  }

  function getLineHeight() {
    const monaco = internals && internals.monaco
    try {
      if (monaco && monaco.editor && monaco.editor.EditorOption
        && monaco.editor.EditorOption.lineHeight !== undefined) {
        return editor.getOption(monaco.editor.EditorOption.lineHeight) || 19
      }
    } catch (e) {}
    return 19
  }

  function maxImageHeight() {
    return Math.max(12, getLineHeight() * sizeScale)
  }

  function mountZone(lineNumber, loaded) {
    const node = document.createElement('div')
    node.className = 'weditor-template-inline'
    const img = document.createElement('img')
    img.src = loaded.url
    img.alt = ''
    const cap = maxImageHeight()
    img.style.maxHeight = cap + 'px'
    img.style.maxWidth = '100%'
    img.style.width = 'auto'
    img.style.height = 'auto'
    node.appendChild(img)
    const shownHeight = loaded.height ? Math.min(loaded.height, cap) : cap
    const height = shownHeight + 12
    const afterLine = position === 'above' ? Math.max(0, lineNumber - 1) : lineNumber
    editor.changeViewZones(accessor => {
      zoneIds.push(accessor.addZone({
        afterLineNumber: afterLine,
        heightInPx: height,
        domNode: node,
      }))
    })
  }

  function mountEndWidget(lineNumber, loaded) {
    const node = document.createElement('div')
    node.className = 'weditor-template-end'
    const img = document.createElement('img')
    img.src = loaded.url
    img.alt = ''
    const cap = maxImageHeight()
    img.style.maxHeight = cap + 'px'
    img.style.width = 'auto'
    img.style.height = 'auto'
    node.appendChild(img)
    const model = editor.getModel()
    const column = model ? model.getLineMaxColumn(lineNumber) : 1
    const preference = (internals && internals.monaco && internals.monaco.editor
      && internals.monaco.editor.ContentWidgetPositionPreference
      && internals.monaco.editor.ContentWidgetPositionPreference.EXACT) || 0
    const widgetId = 'weditor.template.end.' + lineNumber + '.' + Date.now() + '.' + Math.random().toString(36).slice(2)
    const widget = {
      getId: () => widgetId,
      getDomNode: () => node,
      getPosition: () => ({
        position: { lineNumber: lineNumber, column: column },
        preference: [preference],
      }),
      allowEditorOverflow: true,
      suppressMouseDown: true,
    }
    editor.addContentWidget(widget)
    widgets.push(widget)
  }

  async function rebuild() {
    const token = ++rebuildToken
    if (!enabled) { clearAll(); return }
    const targets = templateTargets()
    const prepared = await Promise.all(targets.map(async (item) => {
      const url = resolveUrl(item.path)
      const loaded = url ? await loadImage(url) : null
      return { lineNumber: item.lineNumber, loaded: loaded }
    }))
    if (token !== rebuildToken) return
    clearAll()
    for (const entry of prepared) {
      if (!entry.loaded) continue
      if (position === 'end') mountEndWidget(entry.lineNumber, entry.loaded)
      else mountZone(entry.lineNumber, entry.loaded)
    }
  }

  function scheduleRebuild() {
    if (!enabled) return
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(rebuild, 200)
  }

  function toggle() {
    enabled = !enabled
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    if (enabledContextKey) enabledContextKey.set(enabled)
    ElMessage({
      message: enabled ? '已开启固定图片预览' : '已关闭固定图片预览',
      type: 'info',
      duration: 1500,
    })
    rebuild()
  }

  function setPosition(value) {
    if (position === value) return
    position = value
    localStorage.setItem(POSITION_KEY, value)
    if (positionBelowContextKey) positionBelowContextKey.set(value === 'below')
    if (positionAboveContextKey) positionAboveContextKey.set(value === 'above')
    if (positionEndContextKey) positionEndContextKey.set(value === 'end')
    const messages = {
      above: '图片已移到代码行上方',
      below: '图片已移到代码行下方',
      end: '图片已浮动到代码行尾',
    }
    ElMessage({ message: messages[value], type: 'info', duration: 1200 })
    rebuild()
  }

  function setSize(scale) {
    if (sizeScale === scale) return
    sizeScale = scale
    localStorage.setItem(SIZE_KEY, String(scale))
    SIZE_SCALES.forEach(s => {
      if (sizeContextKeys[s]) sizeContextKeys[s].set(s === scale)
    })
    ElMessage({ message: '图片最大高度：' + scale + ' 倍行高', type: 'info', duration: 1200 })
    rebuild()
  }

  if (internals && internals.actions && internals.commands && internals.contextkey) {
    const { MenuRegistry, MenuId } = internals.actions
    const { CommandsRegistry } = internals.commands
    const { ContextKeyExpr } = internals.contextkey
    enabledContextKey = editor.createContextKey(CONTEXT_KEY, enabled)
    positionBelowContextKey = editor.createContextKey(POSITION_BELOW_KEY, position === 'below')
    positionAboveContextKey = editor.createContextKey(POSITION_ABOVE_KEY, position === 'above')
    positionEndContextKey = editor.createContextKey(POSITION_END_KEY, position === 'end')
    SIZE_SCALES.forEach(s => {
      sizeContextKeys[s] = editor.createContextKey(SIZE_POSITION_KEY_PREFIX + s, s === sizeScale)
    })
    const editorWhen = ContextKeyExpr.equals('editorId', editor.getId())

    CommandsRegistry.registerCommand(COMMAND_ID, () => toggle())
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: COMMAND_ID,
        title: '固定图片预览',
        toggled: { condition: ContextKeyExpr.equals(CONTEXT_KEY, true) },
      },
      when: editorWhen,
      group: '1_modification',
      order: 0,
    })

    CommandsRegistry.registerCommand(COMMAND_BELOW, () => setPosition('below'))
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: COMMAND_BELOW,
        title: '图片显示在行下方',
        toggled: { condition: ContextKeyExpr.equals(POSITION_BELOW_KEY, true) },
      },
      when: ContextKeyExpr.and(editorWhen, ContextKeyExpr.equals(CONTEXT_KEY, true)),
      group: '1_modification',
      order: 1,
    })

    CommandsRegistry.registerCommand(COMMAND_ABOVE, () => setPosition('above'))
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: COMMAND_ABOVE,
        title: '图片显示在行上方',
        toggled: { condition: ContextKeyExpr.equals(POSITION_ABOVE_KEY, true) },
      },
      when: ContextKeyExpr.and(editorWhen, ContextKeyExpr.equals(CONTEXT_KEY, true)),
      group: '1_modification',
      order: 2,
    })

    CommandsRegistry.registerCommand(COMMAND_END, () => setPosition('end'))
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: COMMAND_END,
        title: '图片浮动在行尾',
        toggled: { condition: ContextKeyExpr.equals(POSITION_END_KEY, true) },
      },
      when: ContextKeyExpr.and(editorWhen, ContextKeyExpr.equals(CONTEXT_KEY, true)),
      group: '1_modification',
      order: 3,
    })

    SIZE_SCALES.forEach((scale, index) => {
      const commandId = SIZE_COMMAND_PREFIX + scale
      CommandsRegistry.registerCommand(commandId, () => setSize(scale))
      MenuRegistry.appendMenuItem(MenuId.EditorContext, {
        command: {
          id: commandId,
          title: '图片最大高度 ' + scale + ' 倍行高',
          toggled: { condition: ContextKeyExpr.equals(SIZE_POSITION_KEY_PREFIX + scale, true) },
        },
        when: ContextKeyExpr.and(editorWhen, ContextKeyExpr.equals(CONTEXT_KEY, true)),
        group: '2_weditor_size',
        order: index,
      })
    })
  } else {
    editor.addAction({
      id: COMMAND_ID,
      label: '固定图片预览' + (enabled ? '  ✓' : ''),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 0,
      run: toggle,
    })
    editor.addAction({
      id: COMMAND_BELOW,
      label: '图片显示在行下方' + (position === 'below' ? '  ✓' : ''),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1,
      run: () => setPosition('below'),
    })
    editor.addAction({
      id: COMMAND_ABOVE,
      label: '图片显示在行上方' + (position === 'above' ? '  ✓' : ''),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 2,
      run: () => setPosition('above'),
    })
    editor.addAction({
      id: COMMAND_END,
      label: '图片浮动在行尾' + (position === 'end' ? '  ✓' : ''),
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 3,
      run: () => setPosition('end'),
    })
    SIZE_SCALES.forEach((scale, index) => {
      editor.addAction({
        id: SIZE_COMMAND_PREFIX + scale,
        label: '图片最大高度 ' + scale + ' 倍行高' + (sizeScale === scale ? '  ✓' : ''),
        contextMenuGroupId: '2_weditor_size',
        contextMenuOrder: index,
        run: () => setSize(scale),
      })
    })
  }

  editor.onDidChangeModelContent(scheduleRebuild)
  if (enabled) rebuild()
}

ctx.initMonaco = function initMonaco() {
  return new Promise((resolve) => {
    require.config({ paths: { vs: '/static/vendor/monaco/vs' } })
    require(['vs/editor/editor.main'], function (monaco) {
      monaco.editor.defineTheme('weditor-python', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'keyword.control', foreground: 'C586C0', fontStyle: 'bold' },
          { token: 'string', foreground: 'CE9178' },
          { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
          { token: 'number', foreground: 'B5CEA8' },
          { token: 'identifier', foreground: '9CDCFE' },
          { token: 'type.identifier', foreground: '4EC9B0' },
          { token: 'delimiter', foreground: 'D4D4D4' },
        ],
        colors: {
          'editor.foreground': '#D4D4D4',
          'editorLineNumber.foreground': '#858585',
        },
      })
      monacoEditor = monaco.editor.create(codeContainer.value, {
        value: editor.code.value || C.genClearCode(device.platform.value, device.serial.value),
        language: 'python',
        theme: 'weditor-python',
        automaticLayout: true,
        minimap: { enabled: false },
        quickSuggestions: { other: true, comments: false, strings: false },
        suggestOnTriggerCharacters: true,
      })
      monacoEditor.onDidChangeModelContent(() => {
        editor.code.value = monacoEditor.getValue()
        markFileDirty()
        // 手动改代码等同于结束当前命令，避免填充状态残留导致 Screen 停在框选模式。
        if (activeCommand.value === 'coord' || activeCommand.value === 'template') {
          if (!coordFillEditing) clearActiveCommand()
        } else if ((!coordFillEditing && coordFillRange) || templateFillRange) clearActiveCommand()
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
      const COMPLETION_KIND = {
        function: monaco.languages.CompletionItemKind.Function,
        keyword: monaco.languages.CompletionItemKind.Keyword,
        module: monaco.languages.CompletionItemKind.Module,
        snippet: monaco.languages.CompletionItemKind.Snippet,
      }
      monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position)
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: word.endColumn,
          }
          return {
            suggestions: (C.COMPLETIONS || []).map(c => ({
              label: c.label,
              insertText: c.insertText,
              insertTextRules: c.snippet
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
              kind: COMPLETION_KIND[c.kind] || monaco.languages.CompletionItemKind.Text,
              detail: c.detail,
              documentation: c.doc ? { value: c.doc, isTrusted: true } : undefined,
              filterText: c.filterText || c.label,
              sortText: c.name,
              range,
            })),
          }
        },
      })
      ctx.installSuggestHover(monacoEditor)
      ctx.installTemplatePreview(monacoEditor)
      require([
        'vs/platform/actions/common/actions',
        'vs/platform/commands/common/commands',
        'vs/platform/contextkey/common/contextkey',
      ], function (actions, commands, contextkey) {
        ctx.installTemplateInlineImages(monacoEditor, {
          monaco: monaco,
          actions: actions,
          commands: commands,
          contextkey: contextkey,
        })
        resolve()
      }, function () {
        ctx.installTemplateInlineImages(monacoEditor, { monaco: monaco })
        resolve()
      })
    })
  })
}


}
}
})()
