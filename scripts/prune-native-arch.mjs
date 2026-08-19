#!/usr/bin/env node
/**
 * Drop optional native packages for the *other* CPU so an Apple Silicon pack
 * of the Intel DMG cannot ship arm64 better-sqlite3 / canvas / sqlite-vec.
 *
 * POMNIA_NATIVE_ARCH = x64 | arm64 (default: process.arch)
 */
import { existsSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const keep = process.env.POMNIA_NATIVE_ARCH || process.arch
const drop = keep === 'arm64' ? 'x64' : keep === 'x64' ? 'arm64' : null
if (!drop) {
  console.log(`[prune-native-arch] skip (keep=${keep})`)
  process.exit(0)
}

const moduleRoots = [
  join(root, 'node_modules'),
  join(root, 'build', 'brain-core-runtime-v2', 'node_modules'),
]
if (process.env.POMNIA_STAGE_DIR) {
  moduleRoots.push(join(process.env.POMNIA_STAGE_DIR, 'node_modules'))
}

const rels = [
  `sqlite-vec-darwin-${drop}`,
  `sqlite-vec-linux-${drop}`,
  `@napi-rs/canvas-darwin-${drop}`,
  `@napi-rs/canvas-linux-${drop}`,
  `@napi-rs/canvas/node_modules/@napi-rs/canvas-darwin-${drop}`,
  `@napi-rs/canvas/node_modules/@napi-rs/canvas-linux-${drop}`,
]

let n = 0
for (const base of moduleRoots) {
  if (!existsSync(base)) continue
  for (const rel of rels) {
    const p = join(base, rel)
    if (!existsSync(p)) continue
    console.log('[prune-native-arch] rm', p)
    rmSync(p, { recursive: true, force: true })
    n++
  }
}

console.log(`[prune-native-arch] keep=${keep} removed ${n} wrong-arch package(s)`)

if (process.platform === 'darwin') {
  const keepCanvas = `@napi-rs/canvas-darwin-${keep}`
  const dest = join(root, 'node_modules', '@napi-rs', `canvas-darwin-${keep}`)
  const nested = join(root, 'node_modules', '@napi-rs', 'canvas', 'node_modules', '@napi-rs', `canvas-darwin-${keep}`)
  if (!existsSync(dest) && !existsSync(nested)) {
    console.log(`[prune-native-arch] npm install ${keepCanvas}`)
    execSync(`npm install ${keepCanvas} --no-save --no-audit --no-fund`, {
      cwd: root,
      stdio: 'inherit',
    })
  }
}
