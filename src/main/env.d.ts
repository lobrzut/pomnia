// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia

/**
 * Build-time values electron-vite substitutes into the main bundle.
 *
 * Only `MAIN_VITE_*` reaches this process; the renderer's `VITE_*` does not.
 * Declared here rather than pulling in `vite/client`, which also declares
 * browser globals that have no meaning in the main process.
 */
interface ImportMetaEnv {
  readonly MAIN_VITE_POMNIA_FLAVOUR?: 'mini' | 'full'
}

interface ImportMeta {
  readonly env?: ImportMetaEnv
}
