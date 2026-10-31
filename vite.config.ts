import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',
manifest:{name:'NUESTRA CUENTA',short_name:'Nuestra Cuenta',lang:'es',display:'standalone',start_url:'/',scope:'/',
theme_color:'#12264d',background_color:'#f5f7fb',
icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]}})]})
