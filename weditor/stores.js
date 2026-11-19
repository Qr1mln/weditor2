/* WEditor shared state (former Pinia stores). */
(function () {
  'use strict'
  const { ref, watch } = Vue
  // ---------- state (formerly Pinia stores) ----------
  const device = {
    platform: ref(localStorage.getItem('platform') || 'Android'),
    serial: ref(localStorage.getItem('serial') || ''),
    deviceId: ref(''),
    connecting: ref(false),
    loading: ref(false),
    hierarchy: ref(null),
  }
  watch(device.platform, v => localStorage.setItem('platform', v))
  watch(device.serial, v => localStorage.setItem('serial', v))

  const shell = {
    ws: null,
    wsOpen: ref(false),
    running: ref(false),
    restarting: ref(false),
    output: ref([]),
    lastLineno: ref(null),
    pending: [],
  }

  const editor = {
    code: ref(''),
    generatedCode: ref(''),
    tapMode: ref(localStorage.getItem('tapMode') || 'coordinate'),
  }
  watch(editor.tapMode, v => localStorage.setItem('tapMode', v))

  window.WEditorStores = { device, shell, editor }
})()
