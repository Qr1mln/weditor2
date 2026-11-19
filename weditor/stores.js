/* WEditor shared state (former Pinia stores). */
(function () {
  'use strict'
  const { ref, watch } = Vue
  const K = window.WEditorConstants
  // ---------- state (formerly Pinia stores) ----------
  const device = {
    platform: ref(localStorage.getItem('platform') || 'Android'),
    serial: ref(localStorage.getItem('serial') || ''),
    autoConnect: ref(localStorage.getItem('autoConnect') === '1'),
    deviceId: ref(''),
    connecting: ref(false),
    loading: ref(false),
    hierarchy: ref(null),
  }
  watch(device.platform, v => localStorage.setItem('platform', v))
  watch(device.serial, v => localStorage.setItem('serial', v))
  watch(device.autoConnect, v => localStorage.setItem('autoConnect', v ? '1' : '0'))

  const shell = {
    ws: null,
    wsOpen: ref(false),
    running: ref(false),
    restarting: ref(false),
    debugMode: ref(localStorage.getItem(K.DEBUG_MODE_KEY) === '1'),
    output: ref([]),
    lastLineno: ref(null),
    pending: [],
  }
  watch(shell.debugMode, v => localStorage.setItem(K.DEBUG_MODE_KEY, v ? '1' : '0'))

  const editor = {
    code: ref(''),
    generatedCode: ref(''),
  }

  window.WEditorStores = { device, shell, editor }
})()
