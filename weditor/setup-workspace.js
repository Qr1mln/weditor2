/* WEditor setup module: workspace filesystem */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installWorkspace = function (ctx) {

with (ctx) {
ctx.setCode = function setCode(code) {
  editor.code.value = code
  if (monacoEditor && monacoEditor.getValue() !== code) monacoEditor.setValue(code)
  markFileDirty()
}

ctx.fileErrorText = function fileErrorText(e) {
  return e && e.message ? e.message : String(e)
}

ctx.splitPath = function splitPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').split('/').filter(Boolean)
}

ctx.getDirectoryHandle = async function getDirectoryHandle(parts, create) {
  let current = directoryHandle
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: !!create })
  }
  return current
}

ctx.getFileHandle = async function getFileHandle(path, create) {
  const parts = splitPath(path)
  if (!parts.length) throw new Error('invalid file path')
  const parent = await getDirectoryHandle(parts.slice(0, -1), create)
  return parent.getFileHandle(parts[parts.length - 1], { create: !!create })
}

ctx.getEntryHandle = async function getEntryHandle(path) {
  const parts = splitPath(path)
  if (!parts.length) throw new Error('invalid path')
  const parent = await getDirectoryHandle(parts.slice(0, -1), false)
  const name = parts[parts.length - 1]
  try {
    return await parent.getFileHandle(name)
  } catch (e) {
    return parent.getDirectoryHandle(name)
  }
}

ctx.readFileTextFromHandle = async function readFileTextFromHandle(handle) {
  const file = await handle.getFile()
  return file.text()
}

ctx.writeFileHandle = async function writeFileHandle(handle, text) {
  const writable = await handle.createWritable()
  try {
    await writable.write(text)
    await writable.close()
  } catch (e) {
    try {
      await writable.abort()
    } catch (err) {}
    throw e
  }
}

ctx.removeEntryByPath = async function removeEntryByPath(path) {
  const parts = splitPath(path)
  if (!parts.length) throw new Error('invalid path')
  const parent = await getDirectoryHandle(parts.slice(0, -1), false)
  await parent.removeEntry(parts[parts.length - 1], { recursive: true })
}

ctx.copyHandleToPath = async function copyHandleToPath(handle, path) {
  if (handle.kind === 'file') {
    const target = await getFileHandle(path, true)
    await writeFileHandle(target, await readFileTextFromHandle(handle))
    return
  }
  await getDirectoryHandle(splitPath(path), true)
  for await (const [name, child] of handle.entries()) {
    await copyHandleToPath(child, path ? path + '/' + name : name)
  }
}

ctx.openProject = async function openProject() {
  if (typeof window.showDirectoryPicker !== 'function') {
    ElMessage.error('当前浏览器不支持网页文件夹选择框，请使用 Chrome/Edge')
    return
  }
  try {
    const handle = await window.showDirectoryPicker()
    directoryHandle = handle
    fileSource.value = 'local'
    projectPath.value = handle.name || '项目'
    currentFilePath.value = ''
    currentFileName.value = '未命名.py'
    selectedFileNode.value = null
    suppressFileDirty = true
    try {
      setCode('')
    } finally {
      suppressFileDirty = false
    }
    fileDirty.value = false
    await loadWorkspaceTree()
    ElMessage.success('已打开项目 ' + projectPath.value)
  } catch (e) {
    if (e && e.name === 'AbortError') return
    ElMessage.error('打开项目失败: ' + fileErrorText(e))
  }
}

ctx.describeHandle = async function describeHandle(name, path, handle) {
  if (handle.kind === 'file') {
    fileHandles.set(path, handle)
    return { name, path, type: 'file', leaf: true }
  }
  const children = []
  for await (const [childName, childHandle] of handle.entries()) {
    children.push(await describeHandle(childName, path ? path + '/' + childName : childName, childHandle))
  }
  children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)))
  return { name, path, type: 'dir', leaf: false, children }
}

ctx.loadWorkspaceTree = async function loadWorkspaceTree() {
  fileHandles.clear()
  if (!directoryHandle) {
    fileTreeData.value = []
    return
  }
  workspaceLoading.value = true
  try {
    const items = []
    for await (const [name, handle] of directoryHandle.entries()) {
      items.push(await describeHandle(name, name, handle))
    }
    items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)))
    fileTreeData.value = items
  } catch (e) {
    ElMessage.error('工作区加载失败: ' + fileErrorText(e))
  } finally {
    workspaceLoading.value = false
  }
}

ctx.openWorkspaceFile = async function openWorkspaceFile(data) {
  if (!data || data.type !== 'file') return
  try {
    const handle = fileHandles.get(data.path) || await getFileHandle(data.path, false)
    fileHandles.set(data.path, handle)
    const text = await readFileTextFromHandle(handle)
    suppressFileDirty = true
    currentFilePath.value = data.path
    currentFileName.value = data.name
    try {
      setCode(text)
    } finally {
      suppressFileDirty = false
    }
    fileDirty.value = false
    ElMessage.success('已打开 ' + data.path)
  } catch (e) {
    ElMessage.error('打开文件失败: ' + fileErrorText(e))
  }
}

ctx.onFileTreeNodeClick = function onFileTreeNodeClick(data) {
  selectedFileNode.value = data
  if (!data) return
  if (fileSource.value === 'server') return openServerFile(data)
  if (data.type === 'file') openWorkspaceFile(data)
}

ctx.saveWorkspaceFile = async function saveWorkspaceFile(text) {
  if (!directoryHandle) return ElMessage.warning('请先打开项目')
  let path = currentFilePath.value
  if (!path) {
    let answer
    try {
      answer = await ElMessageBox.prompt('输入项目内文件路径，例如 demo.py', '另存为', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: currentFileName.value || '未命名.py',
      })
    } catch (e) {
      return
    }
    path = String(answer.value || '').trim().replace(/\\/g, '/')
    if (!path) return
  }
  try {
    const handle = await getFileHandle(path, true)
    await writeFileHandle(handle, text)
    fileHandles.set(path, handle)
    currentFilePath.value = path
    currentFileName.value = path.split('/').pop() || '未命名.py'
    fileDirty.value = false
    await loadWorkspaceTree()
    ElMessage.success('已同步到 ' + path)
  } catch (e) {
    ElMessage.error('保存失败: ' + fileErrorText(e))
  }
}

ctx.createWorkspaceEntry = async function createWorkspaceEntry(kind) {
  if (fileSource.value === 'server') return createServerEntry(kind)
  if (!directoryHandle) return ElMessage.warning('请先打开项目')
  let answer
  try {
    answer = await ElMessageBox.prompt(
      kind === 'dir' ? '输入目录路径，例如 scripts/demo' : '输入文件路径，例如 demo.py',
      kind === 'dir' ? '新建目录' : '新建文件',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: kind === 'dir' ? '' : '未命名.py',
      })
  } catch (e) {
    return
  }
  const path = String(answer.value || '').trim().replace(/\\/g, '/')
  if (!path) return
  try {
    if (kind === 'dir') {
      const parts = splitPath(path)
      const parent = await getDirectoryHandle(parts.slice(0, -1), true)
      await parent.getDirectoryHandle(parts[parts.length - 1], { create: true })
    } else {
      const handle = await getFileHandle(path, true)
      await writeFileHandle(handle, '')
      fileHandles.set(path, handle)
    }
    await loadWorkspaceTree()
    if (kind === 'file') {
      currentFilePath.value = path
      currentFileName.value = path.split('/').pop() || '未命名.py'
      suppressFileDirty = true
      try {
        setCode('')
      } finally {
        suppressFileDirty = false
      }
      fileDirty.value = false
    }
    ElMessage.success('已创建 ' + path)
  } catch (e) {
    ElMessage.error('创建失败: ' + fileErrorText(e))
  }
}

ctx.renameWorkspaceEntry = async function renameWorkspaceEntry() {
  if (fileSource.value === 'server') return renameServerEntry()
  if (!directoryHandle) return ElMessage.warning('请先打开项目')
  const node = selectedFileNode.value
  const path = node && node.path ? node.path : currentFilePath.value
  if (!path) return ElMessage.warning('请先选择文件或目录')
  let answer
  try {
    answer = await ElMessageBox.prompt('输入新路径', '重命名', {
      confirmButtonText: '重命名',
      cancelButtonText: '取消',
      inputValue: path,
    })
  } catch (e) {
    return
  }
  const newPath = String(answer.value || '').trim().replace(/\\/g, '/')
  if (!newPath || newPath === path) return
  try {
    const handle = await getEntryHandle(path)
    await copyHandleToPath(handle, newPath)
    await removeEntryByPath(path)
    if (currentFilePath.value === path) {
      currentFilePath.value = newPath
      currentFileName.value = newPath.split('/').pop() || '未命名.py'
    }
    selectedFileNode.value = null
    await loadWorkspaceTree()
    ElMessage.success('已重命名')
  } catch (e) {
    ElMessage.error('重命名失败: ' + fileErrorText(e))
  }
}

ctx.deleteWorkspaceEntry = async function deleteWorkspaceEntry() {
  if (fileSource.value === 'server') return deleteServerEntry()
  if (!directoryHandle) return ElMessage.warning('请先打开项目')
  const node = selectedFileNode.value
  const path = node && node.path ? node.path : currentFilePath.value
  if (!path) return ElMessage.warning('请先选择文件或目录')
  try {
    await ElMessageBox.confirm('确定删除 ' + path + '？', '删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await removeEntryByPath(path)
    if (currentFilePath.value === path) {
      currentFilePath.value = ''
      currentFileName.value = '未命名.py'
      suppressFileDirty = true
      try {
        setCode('')
      } finally {
        suppressFileDirty = false
      }
      fileDirty.value = false
    }
    selectedFileNode.value = null
    await loadWorkspaceTree()
    ElMessage.success('已删除 ' + path)
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error('删除失败: ' + fileErrorText(e))
  }
}

ctx.saveCodeFile = async function saveCodeFile() {
  try {
    if (fileSource.value === 'server') await saveServerFile(editorCode())
    else await saveWorkspaceFile(editorCode())
  } catch (e) {
    ElMessage.error('保存失败: ' + fileErrorText(e))
  }
}

ctx.apiRequest = async function apiRequest(url, options) {
  let resp
  try {
    resp = await fetch(url, options)
  } catch (e) {
    throw new Error('无法连接本地服务：' + fileErrorText(e))
  }
  let data
  try {
    data = await resp.json()
  } catch (e) {
    throw new Error('服务端返回格式错误（HTTP ' + resp.status + '）')
  }
  if (!resp.ok || !data.success) {
    throw new Error(data.error || data.description || ('请求失败（HTTP ' + resp.status + '）'))
  }
  return data
}

ctx.confirmDiscardFile = async function confirmDiscardFile(action) {
  if (!fileDirty.value) return true
  try {
    await ElMessageBox.confirm(
      '当前文件有未保存的修改，' + action + '后将丢弃。是否继续？', action,
      { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' })
    return true
  } catch (e) {
    return false
  }
}

ctx.loadProjectInfo = async function loadProjectInfo() {
  try {
    const data = await apiRequest('/api/v1/project')
    projectPath.value = data.root || ''
    fileSource.value = 'server'
    return data
  } catch (e) {
    projectPath.value = ''
    return null
  }
}

ctx.captureExpandedKeys = function captureExpandedKeys() {
  const tree = explorerTreeRef.value
  if (tree && tree.store && tree.store.nodesMap) {
    const keys = []
    Object.keys(tree.store.nodesMap).forEach((key) => {
      const node = tree.store.nodesMap[key]
      if (node.expanded && node.childNodes && node.childNodes.length) keys.push(key)
    })
    expandedDirKeys.value = keys
  }
  return expandedDirKeys.value.slice()
}

ctx.restoreExpandedKeys = function restoreExpandedKeys(keys) {
  nextTick(() => {
    const tree = explorerTreeRef.value
    if (!tree || !tree.getNode) return
    ;(keys || []).forEach((key) => {
      const node = tree.getNode(key)
      if (node && node.childNodes && node.childNodes.length) tree.setExpanded(key, true)
    })
  })
}

ctx.onTreeNodeExpand = function onTreeNodeExpand(data) {
  if (data && data.path && !expandedDirKeys.value.includes(data.path)) {
    expandedDirKeys.value.push(data.path)
  }
}

ctx.onTreeNodeCollapse = function onTreeNodeCollapse(data) {
  if (data && data.path) {
    expandedDirKeys.value = expandedDirKeys.value.filter(key => key !== data.path)
  }
}

ctx.loadServerTree = async function loadServerTree() {
  const previousKeys = captureExpandedKeys()
  const firstLoad = !fileTreeData.value.length
  workspaceLoading.value = true
  try {
    const data = await apiRequest('/api/v1/files')
    fileTreeData.value = data.items || []
    fileSource.value = 'server'
    if (firstLoad) {
      expandedDirKeys.value = []
    } else {
      restoreExpandedKeys(previousKeys)
    }
  } catch (e) {
    fileTreeData.value = []
    ElMessage.error('服务端工作区加载失败: ' + fileErrorText(e))
  } finally {
    workspaceLoading.value = false
  }
}

ctx.openServerFile = async function openServerFile(data) {
  if (!data || data.type !== 'file') return
  if (!await confirmDiscardFile('打开其他文件')) return
  selectedFileNode.value = data
  try {
    const resp = await apiRequest(
      '/api/v1/files/content?path=' + encodeURIComponent(data.path))
    currentFilePath.value = resp.path || data.path
    currentFileName.value = resp.name || data.name || currentFilePath.value.split('/').pop() || '未命名.py'
    fileSource.value = 'server'
    suppressFileDirty = true
    try {
      setCode(resp.content || '')
    } finally {
      suppressFileDirty = false
    }
    fileDirty.value = false
    ElMessage.success('已打开 ' + currentFilePath.value)
  } catch (e) {
    ElMessage.error('打开文件失败: ' + fileErrorText(e))
  }
}

ctx.saveServerFile = async function saveServerFile(text) {
  if (!currentFilePath.value) {
    let answer
    try {
      answer = await ElMessageBox.prompt('输入项目内文件路径，例如 demo.py', '另存为', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: currentFileName.value || '未命名.py',
      })
    } catch (e) {
      return
    }
    currentFilePath.value = String(answer.value || '').trim().replace(/\\/g, '/')
    if (!currentFilePath.value) return
  }
  try {
    const data = await apiRequest('/api/v1/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFilePath.value, content: text }),
    })
    currentFilePath.value = data.path || currentFilePath.value
    currentFileName.value = currentFilePath.value.split('/').pop() || '未命名.py'
    fileSource.value = 'server'
    fileDirty.value = false
    await loadServerTree()
    ElMessage.success('已保存到 ' + currentFilePath.value)
  } catch (e) {
    ElMessage.error('保存失败: ' + fileErrorText(e))
  }
}

ctx.createServerEntry = async function createServerEntry(kind, basePath) {
  if (kind === 'file' && !await confirmDiscardFile('新建文件')) return
  const prefix = String(basePath || '').replace(/\/$/, '')
  let answer
  try {
    answer = await ElMessageBox.prompt(
      kind === 'dir' ? '输入目录路径，例如 scripts/demo' : '输入文件路径，例如 demo.py',
      kind === 'dir' ? '新建目录' : '新建文件',
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: (prefix ? prefix + '/' : '') + (kind === 'dir' ? '' : '未命名.py'),
      })
  } catch (e) {
    return
  }
  const path = String(answer.value || '').trim().replace(/\\/g, '/')
  if (!path) return
  try {
    const data = await apiRequest('/api/v1/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: kind }),
    })
    fileSource.value = 'server'
    await loadServerTree()
    if (kind === 'file') {
      currentFilePath.value = data.path || path
      currentFileName.value = currentFilePath.value.split('/').pop() || '未命名.py'
      suppressFileDirty = true
      try {
        setCode('')
      } finally {
        suppressFileDirty = false
      }
      fileDirty.value = false
    }
    ElMessage.success('已创建 ' + path)
  } catch (e) {
    ElMessage.error('创建失败: ' + fileErrorText(e))
  }
}

ctx.renameServerEntry = async function renameServerEntry() {
  const node = selectedFileNode.value
  const path = node && node.path ? node.path : currentFilePath.value
  if (!path) return ElMessage.warning('请先选择文件或目录')
  let answer
  try {
    answer = await ElMessageBox.prompt('输入新路径', '重命名', {
      confirmButtonText: '重命名',
      cancelButtonText: '取消',
      inputValue: path,
    })
  } catch (e) {
    return
  }
  const newPath = String(answer.value || '').trim().replace(/\\/g, '/')
  if (!newPath || newPath === path) return
  try {
    await apiRequest('/api/v1/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, newPath }),
    })
    if (currentFilePath.value === path) {
      currentFilePath.value = newPath
      currentFileName.value = newPath.split('/').pop() || '未命名.py'
    }
    selectedFileNode.value = null
    fileSource.value = 'server'
    await loadServerTree()
    expandedDirKeys.value = expandedDirKeys.value.map((key) => {
      if (key === path) return newPath
      if (key.startsWith(path + '/')) return newPath + key.slice(path.length)
      return key
    })
    restoreExpandedKeys(expandedDirKeys.value)
    ElMessage.success('已重命名')
  } catch (e) {
    ElMessage.error('重命名失败: ' + fileErrorText(e))
  }
}

ctx.deleteServerEntry = async function deleteServerEntry() {
  const node = selectedFileNode.value
  const path = node && node.path ? node.path : currentFilePath.value
  if (!path) return ElMessage.warning('请先选择文件或目录')
  try {
    await ElMessageBox.confirm('确定删除 ' + path + '？', '删除', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch (e) {
    return
  }
  try {
    await apiRequest('/api/v1/files?path=' + encodeURIComponent(path) + '&recursive=1', {
      method: 'DELETE',
    })
    if (currentFilePath.value === path) {
      currentFilePath.value = ''
      currentFileName.value = '未命名.py'
      suppressFileDirty = true
      try {
        setCode('')
      } finally {
        suppressFileDirty = false
      }
      fileDirty.value = false
    }
    selectedFileNode.value = null
    fileSource.value = 'server'
    await loadServerTree()
    ElMessage.success('已删除 ' + path)
  } catch (e) {
    ElMessage.error('删除失败: ' + fileErrorText(e))
  }
}

ctx.closeExplorerMenu = function closeExplorerMenu() {
  explorerMenu.value.visible = false
  explorerMenu.value.node = null
}

ctx.onExplorerContextMenu = function onExplorerContextMenu(e, data) {
  selectedFileNode.value = data || null
  explorerMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 140),
    y: Math.min(e.clientY, window.innerHeight - 130),
    node: data || null,
  }
}

ctx.onExplorerBackgroundContextMenu = function onExplorerBackgroundContextMenu(e) {
  selectedFileNode.value = null
  explorerMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 140),
    y: Math.min(e.clientY, window.innerHeight - 130),
    node: null,
  }
}

ctx.contextMenuBasePath = function contextMenuBasePath() {
  const node = explorerMenu.value.node
  if (!node) return ''
  if (node.type === 'dir') return node.path || ''
  const parts = String(node.path || '').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

ctx.contextNewFile = function contextNewFile() {
  const base = contextMenuBasePath()
  closeExplorerMenu()
  createServerEntry('file', base)
}

ctx.contextNewDir = function contextNewDir() {
  const base = contextMenuBasePath()
  closeExplorerMenu()
  createServerEntry('dir', base)
}

ctx.contextRename = function contextRename() {
  closeExplorerMenu()
  renameServerEntry()
}

ctx.contextDelete = function contextDelete() {
  closeExplorerMenu()
  deleteServerEntry()
}


}
}
})()
