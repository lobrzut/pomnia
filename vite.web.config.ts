/**
 * Browser-only dev server for the renderer — no Electron.
 *
 * The renderer falls back to `mockBridge()` when `window.reliqua` is absent
 * (see src/renderer/src/lib/api.ts), so every page renders with illustrative
 * data. Used for visual/design iteration where we need a real browser
 * (screenshots, DOM inspection) instead of an Electron window.
 *
 *   npx vite --config vite.web.config.ts
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/renderer',
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@core': resolve('src/core')
    }
  },
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true }
})
