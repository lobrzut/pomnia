/**
 * Build resources/icon.ico from resources/icon.png (PNG-embedded ICO).
 * Place or resize the chosen logo to resources/icon.png first (512×512 recommended).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function encodeICO(png) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2) // type icon
  dir.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = 0 // 256 width encoded as 0
  entry[1] = 0 // 256 height
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12)
  return Buffer.concat([dir, entry, png])
}

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const resDir = path.join(root, 'resources')
const pngPath = path.join(resDir, 'icon.png')
const icoPath = path.join(resDir, 'icon.ico')

await fs.mkdir(resDir, { recursive: true })
const png = await fs.readFile(pngPath)
await fs.writeFile(icoPath, encodeICO(png))
console.log('icon.ico written from', pngPath, `(${png.length} bytes PNG) →`, icoPath)
