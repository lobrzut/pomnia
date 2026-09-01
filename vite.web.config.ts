/**
 * Browser-only dev server for the renderer — no Electron.
 *
 * The renderer falls back to `mockBridge()` when `window.pomnia` is absent
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
  // Vite resolves .env files against `root`, which is the renderer folder, not
  // the repository. Without this, `.env.mini` at the top level is silently
  // ignored and a --mode mini run quietly builds the full app — which is
  // exactly what it did the first time.
  envDir: resolve('.'),
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@core': resolve('src/core'),
      // Kept in step with electron.vite.config.ts. Without it the harness dies
      // on AppLogo's icon import and renders a blank page — which reads as
      // "the renderer is broken" rather than "the dev server is misconfigured",
      // and the difference matters most on the day you are checking a release.
      '@brand': resolve('resources')
    }
  },
  plugins: [react(), tailwindcss()],
  server: { port: 5199, strictPort: true }
})
