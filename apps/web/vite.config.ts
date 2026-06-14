import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // El SW se registra solo (inyectado en index.html) y se auto-actualiza en
      // cada deploy nuevo, asi el usuario no queda con una version vieja cacheada.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['brand/favicon.ico', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'ConsulTech',
        short_name: 'ConsulTech',
        description: 'Gestion de consultorio: agenda, caja, pacientes y reportes.',
        lang: 'es',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/brand/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/brand/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/brand/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo precachea el app-shell (js/css/html). La API esta en otro origen,
        // asi que el SW nunca cachea respuestas de la API; offline cae a index.html.
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      // Vite bundlea el source TS de @pos/types (el dist CJS es para el API;
      // Rollup no importa named exports de CJS). TypeScript tipa contra
      // dist/index.d.ts: si falta el build de packages/types, tsc avisa.
      '@pos/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
