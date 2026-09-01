import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin, type Plugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Main: do NOT use externalizeDepsPlugin for app deps.
// 0.1.26 excluded "bluebird" but Vite SSR still left bare
// `import from "bluebird/js/release/promise"` — Node then looks for package
// bluebird at asar root (missing; only mammoth/node_modules/bluebird existed).
const mainExternals = [
  'electron',
  // Native + worker/wasm — must resolve at runtime from node_modules / asarUnpack.
  'tesseract.js',
  'tesseract.js-core',
  '@napi-rs/canvas',
  'pdfjs-dist',
]

/** Force-resolve mammoth's bluebird subpath so Rollup inlines it (no bare import). */
function forceBundleBluebird(): Plugin {
  const promiseJs = resolve('node_modules/bluebird/js/release/promise.js')
  const rootJs = resolve('node_modules/bluebird/js/release/bluebird.js')
  return {
    name: 'force-bundle-bluebird',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'bluebird/js/release/promise' || id === 'bluebird/js/release/promise.js') {
        return promiseJs
      }
      if (id === 'bluebird' || id === 'bluebird/') {
        return rootJs
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [forceBundleBluebird()],
    resolve: {
      alias: {
        '@core': resolve('src/core'),
        // Avoid loading full brain-core (better-sqlite3) into Electron main.
        '@pomnia/brain-core/vault': resolve('packages/brain-core/src/storage/vault.ts'),
      },
    },
    // Critical: Vite SSR externalizes node_modules by default (incl. subpaths).
    ssr: {
      noExternal: true,
      external: mainExternals,
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
        external: mainExternals,
      },
      commonjsOptions: {
        // mammoth + bluebird are CJS; pull them into the ESM main bundle.
        include: [/node_modules/, /packages[\\/]doc-parser/, /packages[\\/]brain-core/],
        transformMixedEsModules: true,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve('src/preload/index.ts') } }
    }
  },
  renderer: {
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
        '@brand': resolve('resources')
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: { index: resolve('src/renderer/index.html') } }
    }
  }
})
