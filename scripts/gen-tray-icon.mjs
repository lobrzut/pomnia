/**
 * Build color tray icons from the Pomnia brand mark (resources/icon.png).
 * 22px + 44px (@2x), alpha kept. Not a Template silhouette.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const resDir = path.join(root, 'resources')
const srcPng = path.join(resDir, 'icon.png')
const electronBin = path.join(root, 'node_modules', '.bin', 'electron')

await fs.mkdir(resDir, { recursive: true })

try {
  await fs.access(electronBin)
  await fs.access(srcPng)
} catch {
  console.error('need electron + resources/icon.png')
  process.exit(1)
}

const worker = `
const { app, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const srcPath = process.env.POMNIA_TRAY_SRC
const outDir = process.env.POMNIA_TRAY_OUT
app.whenReady().then(() => {
  const src = nativeImage.createFromPath(srcPath)
  if (src.isEmpty()) { console.error('empty'); app.exit(1); return }
  for (const [name, size] of [['trayIcon.png', 22], ['trayIcon@2x.png', 44]]) {
    const resized = src.resize({ width: size, height: size, quality: 'best' })
    const { width, height } = resized.getSize()
    const buf = Buffer.from(resized.toBitmap())
    const cx = (width - 1) / 2, cy = (height - 1) / 2, R = Math.min(width, height) * 0.5
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const dist = Math.hypot(x - cx, y - cy)
      let edge = 1
      if (dist > R) edge = 0
      else if (dist > R - 0.85) edge = Math.max(0, (R - dist) / 0.85)
      buf[i + 3] = Math.round((buf[i + 3] / 255) * 255 * edge)
    }
    fs.writeFileSync(path.join(outDir, name), nativeImage.createFromBitmap(buf, { width, height }).toPNG())
    console.log('wrote', name)
  }
  app.exit(0)
})
`
const workerPath = path.join(root, 'build', 'gen-tray-worker.cjs')
await fs.mkdir(path.dirname(workerPath), { recursive: true })
await fs.writeFile(workerPath, worker)

await new Promise((resolve, reject) => {
  const child = spawn(electronBin, [workerPath], {
    env: { ...process.env, POMNIA_TRAY_SRC: srcPng, POMNIA_TRAY_OUT: resDir },
    stdio: 'inherit',
  })
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('electron exit ' + code))))
  child.on('error', reject)
})
