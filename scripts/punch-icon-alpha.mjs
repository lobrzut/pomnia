/**
 * Punch opaque square background from resources/icon.png to transparent corners.
 * Pure Node (zlib). Flood-fills from borders with radius guard so dark stone is kept.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const inflate = promisify(zlib.inflate)
const deflate = promisify(zlib.deflate)

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const pngPath = path.join(root, 'resources', 'icon.png')

const COLOR_THRESH = 36
const SOFT_BAND = 14
/** Fraction of inscribed-circle radius inside which flood never clears pixels. */
const PROTECT_FRAC = 0.84
/**
 * Dim teal/cyan atmospheric haze (common FLUX fringe) that is NOT near-black
 * corner bg — previous punch left opaque square-edge remnants above the stone.
 * Clearable only via border flood so bright stone rim stops the fill.
 */
const HAZE_LUM_MAX = 72
const HAZE_CH_MAX = 98

function crc32(buf) {
  let c = 0xffffffff
  if (!crc32.table) {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c2 = n
      for (let k = 0; k < 8; k++) c2 = c2 & 1 ? 0xedb88320 ^ (c2 >>> 1) : c2 >>> 1
      t[n] = c2 >>> 0
    }
    crc32.table = t
  }
  const table = crc32.table
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

async function decodePng(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('Not a PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  const idat = []
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + len
  }
  if (bitDepth !== 8) throw new Error('Unsupported bitDepth ' + bitDepth)
  if (![2, 6].includes(colorType)) throw new Error('Unsupported colorType ' + colorType)
  const inflated = await inflate(Buffer.concat(idat))
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const rgba = Buffer.alloc(width * height * 4)
  let src = 0
  const prev = Buffer.alloc(stride)
  const row = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++]
    inflated.copy(row, 0, src, src + stride)
    src += stride
    if (filter === 1) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? row[i - bpp] : 0
        row[i] = (row[i] + left) & 0xff
      }
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) row[i] = (row[i] + prev[i]) & 0xff
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? row[i - bpp] : 0
        row[i] = (row[i] + ((left + prev[i]) >> 1)) & 0xff
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0
        const b = prev[i]
        const c = i >= bpp ? prev[i - bpp] : 0
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        row[i] = (row[i] + pr) & 0xff
      }
    } else if (filter !== 0) {
      throw new Error('Unsupported filter ' + filter)
    }
    for (let x = 0; x < width; x++) {
      const si = x * bpp
      const di = (y * width + x) * 4
      rgba[di] = row[si]
      rgba[di + 1] = row[si + 1]
      rgba[di + 2] = row[si + 2]
      rgba[di + 3] = bpp === 4 ? row[si + 3] : 255
    }
    row.copy(prev)
  }
  return { width, height, rgba }
}

async function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const compressed = await deflate(raw, { level: 9 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function distRGB(r, g, b, br, bg, bb) {
  const dr = r - br
  const dg = g - bg
  const db = b - bb
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function punchAlpha(width, height, rgba) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  const samples = []
  for (const [cx, cy] of corners) {
    let sr = 0
    let sg = 0
    let sb = 0
    let n = 0
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const x = Math.min(width - 1, Math.max(0, cx + (cx === 0 ? dx : -dx)))
        const y = Math.min(height - 1, Math.max(0, cy + (cy === 0 ? dy : -dy)))
        const i = (y * width + x) * 4
        sr += rgba[i]
        sg += rgba[i + 1]
        sb += rgba[i + 2]
        n++
      }
    }
    samples.push([sr / n, sg / n, sb / n])
  }
  console.log(
    'Corner bg samples (RGB avg):',
    samples.map((s) => s.map((v) => Math.round(v))),
  )

  function isBgLike(r, g, b) {
    let best = Infinity
    for (const [br, bg, bb] of samples) {
      const d = distRGB(r, g, b, br, bg, bb)
      if (d < best) best = d
    }
    return best
  }

  /** Dim teal/cyan square-edge haze (not stone highlights / flame). */
  function isHaze(r, g, b) {
    const lum = (r + g + b) / 3
    const mx = Math.max(r, g, b)
    if (lum > HAZE_LUM_MAX || mx > HAZE_CH_MAX) return false
    // Cool/teal bias — reject warm amber flame spill
    if (r > g + 8 || r > b + 8) return false
    return g >= r - 6 && b >= r - 6
  }

  /** Soft score: 0 = fully clear; Infinity = not clearable. */
  function clearScore(r, g, b) {
    const d = isBgLike(r, g, b)
    if (d <= COLOR_THRESH + SOFT_BAND) return d
    if (isHaze(r, g, b)) return 0
    return Infinity
  }

  const midX = (width - 1) / 2
  const midY = (height - 1) / 2
  const rFull = Math.min(width, height) * 0.5
  const protectR = rFull * PROTECT_FRAC

  const visited = new Uint8Array(width * height)
  const queue = []
  const seeds = [...corners]
  for (let x = 0; x < width; x += 4) {
    seeds.push([x, 0], [x, height - 1])
  }
  for (let y = 0; y < height; y += 4) {
    seeds.push([0, y], [width - 1, y])
  }

  for (const [sx, sy] of seeds) {
    const si = sy * width + sx
    if (visited[si]) continue
    if (Math.hypot(sx - midX, sy - midY) < protectR) continue
    const i = si * 4
    if (clearScore(rgba[i], rgba[i + 1], rgba[i + 2]) === Infinity) continue
    visited[si] = 1
    queue.push(sx, sy)
  }

  let qi = 0
  const dirs = [1, 0, -1, 0, 0, 1, 0, -1]
  while (qi < queue.length) {
    const x = queue[qi++]
    const y = queue[qi++]
    const i = (y * width + x) * 4
    const rad = Math.hypot(x - midX, y - midY)
    if (rad < protectR) continue
    const d = clearScore(rgba[i], rgba[i + 1], rgba[i + 2])
    if (d === Infinity) continue
    if (d <= COLOR_THRESH) {
      rgba[i + 3] = 0
    } else {
      rgba[i + 3] = Math.min(
        rgba[i + 3],
        Math.round(((d - COLOR_THRESH) / SOFT_BAND) * 255),
      )
    }
    for (let di = 0; di < 8; di += 2) {
      const nx = x + dirs[di]
      const ny = y + dirs[di + 1]
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const ni = ny * width + nx
      if (visited[ni]) continue
      if (Math.hypot(nx - midX, ny - midY) < protectR) continue
      const j = ni * 4
      if (clearScore(rgba[j], rgba[j + 1], rgba[j + 2]) !== Infinity) {
        visited[ni] = 1
        queue.push(nx, ny)
      }
    }
  }

  // Soft circular falloff for remaining clearable pixels in the outer ring
  const rInner = rFull * 0.92
  const rOuter = rFull
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (rgba[i + 3] === 0) continue
      const r = Math.hypot(x - midX, y - midY)
      if (r <= rInner) continue
      if (clearScore(rgba[i], rgba[i + 1], rgba[i + 2]) === Infinity) continue
      if (r >= rOuter) {
        rgba[i + 3] = 0
      } else {
        rgba[i + 3] = Math.min(
          rgba[i + 3],
          Math.round(((rOuter - r) / (rOuter - rInner)) * 255),
        )
      }
    }
  }
}

function verify(width, height, rgba) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]
  const cornerAlphas = corners.map(([x, y]) => rgba[(y * width + x) * 4 + 3])
  const center = rgba[(Math.floor(height / 2) * width + Math.floor(width / 2)) * 4 + 3]
  let transparent = 0
  let opaque = 0
  let partial = 0
  for (let i = 3; i < rgba.length; i += 4) {
    const a = rgba[i]
    if (a === 0) transparent++
    else if (a === 255) opaque++
    else partial++
  }
  const total = width * height
  const pct = (100 * transparent) / total
  console.log('Corner alphas:', cornerAlphas)
  console.log('Center alpha:', center)
  console.log(
    'Transparent: ' +
      transparent +
      '/' +
      total +
      ' (' +
      pct.toFixed(1) +
      '%) opaque=' +
      opaque +
      ' partial=' +
      partial,
  )
  if (cornerAlphas.some((a) => a !== 0)) throw new Error('Corners not fully transparent')
  if (center < 200) throw new Error('Center alpha too low')
  if (pct < 10 || pct > 45) {
    throw new Error('Transparent% ' + pct.toFixed(1) + ' out of expected ~15-40% band')
  }
  return { cornerAlphas, center, transparentPct: pct, transparent, opaque, partial, total }
}

const png = await fs.readFile(pngPath)
const { width, height, rgba } = await decodePng(png)
console.log('Decoded ' + width + 'x' + height)
punchAlpha(width, height, rgba)
const stats = verify(width, height, rgba)
const out = await encodePng(width, height, rgba)
await fs.writeFile(pngPath, out)
console.log('Wrote ' + pngPath + ' (' + out.length + ' bytes)')
console.log(JSON.stringify(stats))