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
  try {
    return (require('../package.json') as { version?: string }).version ?? '0.0.0'
  } catch {
    // Bundled without the manifest — better an honest unknown than a stale
    // number that looks authoritative.
    return '0.0.0'
  }
}

export const BRAIN_CORE_VERSION = read()
