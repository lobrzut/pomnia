/**
 * Generate the app icon with zero dependencies (Node + zlib only).
 * Produces resources/icon.png (256×256 RGBA) and resources/icon.ico (PNG-embedded).
 * Design: rounded-square with a violet→iris→cyan diagonal gradient + a white "C".
 */
import zlib from 'node:zlib'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const S = 256
const PAD = 8
const RR = 56 // corner radius

const lerp = (a, b, t) => a + (b - a) * t
function ramp(t) {
  // 3-stop: violet -> iris -> cyan
  const stops = [
    [0.0, [139, 92, 246]],
    [0.5, [99, 102, 241]],
    [1.0, [34, 211, 238]]
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i]
    const [p1, c1] = stops[i + 1]
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / (p1 - p0)
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)]
    }
  }
  return stops[stops.length - 1][1]
}

// Rounded-rect coverage (0..1) with ~1px antialias.
function roundRectAlpha(x, y) {
  const lo = PAD
  const hi = S - PAD
  const r = RR
  const cx = Math.min(Math.max(x, lo + r), hi - r)
  const cy = Math.min(Math.max(y, lo + r), hi - r)
  const inCornerX = x < lo + r || x > hi - r
  const inCornerY = y < lo + r || y > hi - r
  if (x < lo || x > hi || y < lo || y > hi) return 0
  if (inCornerX && inCornerY) {
    const d = Math.hypot(x - cx, y - cy)
    return Math.max(0, Math.min(1, r - d + 0.5))
  }
  return 1
}

// Thick line segment coverage (~1px AA).
function seg(x, y, x1, y1, x2, y2, half) {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  const px = x1 + t * dx
  const py = y1 + t * dy
  return half - Math.hypot(x - px, y - py) + 0.5
}
function ringPart(x, y, cx, cy, rO, rI) {
  const d = Math.hypot(x - cx, y - cy)
  return Math.min(rO - d, d - rI) + 0.5
}

// White "R": stem + top bowl (right loop) + diagonal leg. Coverage 0..1.
function rAlpha(x, y) {
  const stem = seg(x, y, 104, 76, 104, 180, 13)
  const bowl = x >= 104 ? ringPart(x, y, 120, 108, 36, 15) : -99
  const leg = seg(x, y, 108, 132, 164, 180, 13)
  return Math.max(0, Math.min(1, Math.max(stem, bowl, leg)))
}

function buildPixels() {
  const buf = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const tile = roundRectAlpha(x, y)
      if (tile <= 0) {
        buf[i + 3] = 0
        continue
      }
      const t = (x + y) / (2 * (S - 1))
      let [r, g, b] = ramp(t)
      // subtle top-left sheen
      const sheen = Math.max(0, 1 - (x + y) / (S * 1.4)) * 28
      r = Math.min(255, r + sheen)
      g = Math.min(255, g + sheen)
      b = Math.min(255, b + sheen)
      const c = rAlpha(x, y)
      if (c > 0) {
        r = lerp(r, 255, c)
        g = lerp(g, 255, c)
        b = lerp(b, 255, c)
      }
      buf[i] = Math.round(r)
      buf[i + 1] = Math.round(g)
      buf[i + 2] = Math.round(b)
      buf[i + 3] = Math.round(255 * tile)
    }
  }
  return buf
}

// ── PNG encoder ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePNG(pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  // filter byte 0 per scanline
  const raw = Buffer.alloc(S * (S * 4 + 1))
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0
    pixels.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
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
await fs.mkdir(resDir, { recursive: true })
const png = encodePNG(buildPixels())
await fs.writeFile(path.join(resDir, 'icon.png'), png)
await fs.writeFile(path.join(resDir, 'icon.ico'), encodeICO(png))
console.log('icon.png', png.length, 'bytes; icon.ico written →', resDir)
