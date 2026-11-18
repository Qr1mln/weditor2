import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import AutoImport from 'unplugin-auto-import/vite'

// Dev runs at base '/' so proxy keys (/api, /ws) match the app's fetch paths.
// Production build uses base '/static/dist/' so assets resolve under Tornado's
// static_path (weditor/static), with no backend code change needed.
export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  base: command === 'build' ? '/static/dist/' : '/',
  build: {
    outDir: '../weditor/static/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:17310',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:17310',
        ws: true,
      },
    },
  },
}))
