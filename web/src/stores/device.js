import { defineStore } from 'pinia'

export const useDeviceStore = defineStore('device', {
  state: () => ({
    platform: localStorage.getItem('platform') || 'Android',
    serial: localStorage.getItem('serial') || '',
    deviceId: '',
    connecting: false,
    loading: false,
    hierarchy: null,
    screenshotUrl: '',
  }),
  actions: {
    setPlatform(v) {
      this.platform = v
      localStorage.setItem('platform', v)
    },
    setSerial(v) {
      this.serial = v
      localStorage.setItem('serial', v)
    },
    async connect() {
      this.connecting = true
      try {
        const body = new URLSearchParams({
          platform: this.platform,
          deviceUrl: this.serial,
        })
        const r = await fetch('/api/v1/connect', { method: 'POST', body })
        const data = await r.json()
        if (!data.success) throw new Error(data.description || 'connect failed')
        this.deviceId = data.deviceId
        return data
      } finally {
        this.connecting = false
      }
    },
  },
})
