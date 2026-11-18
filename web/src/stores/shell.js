import { defineStore } from 'pinia'

export const useShellStore = defineStore('shell', {
  state: () => ({
    ws: null,
    wsOpen: false,
    running: false,
    restarting: false,
    output: [],
    lastLineno: null,
  }),
  actions: {
    connect() {
      if (this.ws && this.ws.readyState <= 1) return
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${proto}//${location.host}/ws/v1/python`)
      this.ws = ws
      ws.onopen = () => { this.wsOpen = true }
      ws.onclose = () => { this.wsOpen = false }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if (msg.method === 'output') {
            this.output.push({ value: msg.value, lineno: null })
          } else if (msg.method === 'finish') {
            this.running = false
          } else if (msg.method === 'restarted') {
            this.restarting = false
          } else if (msg.method === 'gotoLine') {
            // consumed by editor via lastLineno
            this.lastLineno = msg.value
          }
        } catch (e) { /* ignore non-json frames */ }
      }
      return ws
    },
    run(code) {
      if (!this.ws || this.ws.readyState !== 1) this.connect()
      this.running = true
      this.output = []
      this.ws.send(JSON.stringify({ method: 'input', value: code }))
    },
    interrupt() {
      if (this.ws && this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ method: 'keyboardInterrupt' }))
      }
    },
    restart() {
      if (this.ws && this.ws.readyState === 1) {
        this.restarting = true
        this.ws.send(JSON.stringify({ method: 'restartKernel' }))
      }
    },
  },
})
