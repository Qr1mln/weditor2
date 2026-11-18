import { defineStore } from 'pinia'

export const useEditorStore = defineStore('editor', {
  state: () => ({
    code: '',
    generatedCode: '',
    tapMode: localStorage.getItem('tapMode') || 'coordinate',
    autoCopy: true,
  }),
  actions: {
    setCode(code) { this.code = code },
    setTapMode(mode) {
      this.tapMode = mode
      localStorage.setItem('tapMode', mode)
    },
  },
})
