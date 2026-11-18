import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import App from './App.vue'

// Element Plus components are resolved on-demand by unplugin-vue-components
// (see vite.config.js), so no global `.use(ElementPlus)` is needed.
createApp(App).use(createPinia()).mount('#app')
