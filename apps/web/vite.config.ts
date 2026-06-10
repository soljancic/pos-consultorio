import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
