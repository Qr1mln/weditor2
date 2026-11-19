/* WEditor setup module: python shell */
(function () {
window.WEditorSetupModules = window.WEditorSetupModules || {}
window.WEditorSetupModules.installShell = function (ctx) {

with (ctx) {
ctx.fetchVersion = async function fetchVersion() {
  try {
    const d = await fetch('/api/v1/version').then(r => r.json())
    version.value = d.version || 'unknown'
  } catch (e) { version.value = 'ERR' }
}

ctx.shellConnect = function shellConnect() {
  if (shell.ws && shell.ws.readyState <= 1) return
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${proto}//${location.host}/ws/v1/python`
  console.log('[ws] connecting', wsUrl)
  const ws = new WebSocket(wsUrl)
  shell.ws = ws
  ws.onopen = () => {
    console.log('[ws] open', wsUrl)
    shell.wsOpen.value = true
    flushPendingShell()
  }
  ws.onerror = (ev) => {
    console.error('[ws] error', ev)
  }
  ws.onclose = (ev) => {
    console.warn('[ws] close', 'code=', ev.code, 'reason=', ev.reason, 'clean=', ev.wasClean)
    shell.wsOpen.value = false
  }
  ws.onmessage = (ev) => {
    console.log('[ws] recv', ev.data)
    try {
      const msg = JSON.parse(ev.data)
      if (msg.method === 'output') {
        const level = resolveLogLevel(msg.level, msg.value)
        shell.output.value.push({ value: msg.value, level })
      }
      else if (msg.method === 'finish') shell.running.value = false
      else if (msg.method === 'restarted') shell.restarting.value = false
      else if (msg.method === 'gotoLine') shell.lastLineno.value = msg.value
    } catch (e) { /* non-json frames */ }
  }
  return ws
}

ctx.flushPendingShell = function flushPendingShell() {
  if (!shell.ws || shell.ws.readyState !== 1) return
  while (shell.pending.length) {
    const code = shell.pending.shift()
    const payload = JSON.stringify({ method: 'input', value: code })
    console.log('[ws] send queued', payload)
    shell.ws.send(payload)
  }
}

ctx.shellRun = function shellRun(code) {
  if (!code) return
  const ready = shell.ws && shell.ws.readyState === 1
  if (!shell.pending.length) shell.output.value = []
  shell.running.value = true
  if (!ready) {
    shellConnect()
    shell.pending.push(code)
    console.log('[ws] queued', code)
    return
  }
  const payload = JSON.stringify({ method: 'input', value: code })
  console.log('[ws] send', payload)
  shell.ws.send(payload)
}

ctx.shellInterrupt = function shellInterrupt() {
  if (shell.ws && shell.ws.readyState === 1) {
    console.log('[ws] send', 'keyboardInterrupt')
    shell.ws.send(JSON.stringify({ method: 'keyboardInterrupt' }))
  }
}

ctx.shellRestart = function shellRestart() {
  if (shell.ws && shell.ws.readyState === 1) {
    shell.restarting.value = true
    console.log('[ws] send', 'restartKernel')
    shell.ws.send(JSON.stringify({ method: 'restartKernel' }))
  }
}

ctx.ElMessage = window.ElementPlus.ElMessage


}
}
})()
