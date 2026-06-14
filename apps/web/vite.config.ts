import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt: ante un deploy nuevo NO se recarga solo; PwaUpdatePrompt muestra
      // un aviso "Actualizar" y el usuario decide cuando recargar (no pierde lo
      // que esta haciendo). El registro del SW lo hace useRegisterSW (main.tsx),
      // que ademas chequea updates cada 60s para pestañas abiertas mucho rato.
      registerType: 'prompt',
      injectRegister: null,
      manifestFilename: 'manifest.json',
      includeAssets: ['brand/favicon.ico', 'brand/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'ConsulTech',
        short_name: 'ConsulTech',
        description: 'Gestion de consultorio: agenda, caja, pacientes y reportes.',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#0891B2',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['medical', 'productivity', 'business'],
        icons: [
          { src: '/brand/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/brand/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-shell precacheado (js/css/html). Offline, cualquier navegacion cae
        // a index.html (la SPA arranca desde cache).
        globPatterns: ['**/*.{js,css,html}'],
        navigateFallback: '/index.html',
        // Listeners de push para el futuro (showNotification / notificationclick)
        importScripts: ['/sw-push.js'],
        // Limpia caches viejos de versiones anteriores del SW
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // API (otro origen): NetworkFirst en GET. Online siempre trae fresco
            // (timeout 5s); offline sirve la ultima respuesta cacheada → la
            // agenda/caja se pueden consultar sin red. POST/PUT NO se cachean.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /\/api\/v1\//.test(url.href),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'consultech-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Imagenes (QR/fotos en Cloudinary, capturas de ayuda): se sirven de
            // cache y se revalidan en segundo plano.
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'consultech-img',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
