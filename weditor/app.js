/* WEditor frontend entry: assemble setup() from responsibility modules.
 * Vue 3 global build, no bundler. Module files populate window.WEditorCtx. */
(function () {
  'use strict'

  const { createApp } = Vue

  createApp({
    setup() {
      const ctx = window.WEditorCtx
      const m = window.WEditorSetupModules
      m.installState(ctx)
      m.installScreen(ctx)
      m.installGestures(ctx)
      m.installRefresh(ctx)
      m.installLayout(ctx)
      m.installShell(ctx)
      m.installMinicap(ctx)
      m.installDevice(ctx)
      m.installWorkspace(ctx)
      m.installCoding(ctx)
      m.installLifecycle(ctx)
      return Object.assign({}, ctx, {
        codingActions: ctx.CODING_ACTIONS,
        genClearCode: ctx.C.genClearCode,
      })
    },
    template: window.WEditorTemplate,
  }).use(window.ElementPlus).mount('#app')
})()
