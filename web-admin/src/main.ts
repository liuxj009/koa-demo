import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import elementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import router from './routes/index'


const app = createApp(App)
app.use(elementPlus).use(router).mount('#app')
