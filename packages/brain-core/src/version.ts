// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * One version string for the whole package.
 *
 * The MCP handshake used to advertise a literal '0.1.0' while package.json had
 * moved to 0.1.7 — so every agent that connected was told the wrong build, and
 * any bug report quoting it pointed at the wrong code. Read it from the
 * manifest instead of retyping it, since the manifest is what actually ships.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function read(): string {
  // Two layouts, and only one of them was handled. In the repo this file is
  // packages/brain-core/dist/version.js, so '../package.json' is the package
  // manifest. Staged for shipping it is flattened - version.js and
  // package.json sit side by side - and '../package.json' resolves a level too
  // high, to Electron's resources manifest. Every packaged build therefore
  // reported 0.0.0, which is the exact failure this module was written to stop.
  for (const rel of ['../package.json', './package.json']) {
    try {
      const v = (require(rel) as { version?: string }).version
      if (v) return v
    } catch {
      /* try the next layout */
    }
  }
  // Genuinely bundled without a manifest - an honest unknown beats a stale
  // number that looks authoritative.
  return '0.0.0'
}

export const BRAIN_CORE_VERSION = read()
