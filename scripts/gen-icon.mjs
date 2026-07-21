/**
 * Build resources/icon.ico from resources/icon.png (multi-resolution PNG-in-ICO).
 * Preserves RGBA alpha. Resizes with box/nearest (no sharp).
 * Place logo at resources/icon.png first (512×512 recommended).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const inflate = promisify(zlib.inflate)
const deflate = promisify(zlib.deflate)

const SIZES = [16, 24, 32, 48, 64, 128, 256]

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
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
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
    } else if (filter !== 0) throw new Error('Unsupported filter ' + filter)
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

/** Box-average downsample (or nearest when upsizing). Preserves alpha. */
function resizeRgba(srcW, srcH, src, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4)
  if (dstSize === srcW && dstSize === srcH) {
    src.copy(dst)
    return dst
  }
  const scale = srcW / dstSize
  if (scale >= 1) {
    for (let y = 0; y < dstSize; y++) {
      for (let x = 0; x < dstSize; x++) {
        const x0 = Math.floor(x * scale)
        const y0 = Math.floor(y * scale)
        const x1 = Math.min(srcW, Math.floor((x + 1) * scale))
        const y1 = Math.min(srcH, Math.floor((y + 1) * scale))
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let n = 0
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const i = (sy * srcW + sx) * 4
            const aa = src[i + 3]
            r += src[i] * aa
            g += src[i + 1] * aa
            b += src[i + 2] * aa
            a += aa
            n++
          }
        }
        const di = (y * dstSize + x) * 4
        if (a === 0 || n === 0) {
          dst[di] = 0
          dst[di + 1] = 0
          dst[di + 2] = 0
          dst[di + 3] = 0
        } else {
          dst[di] = Math.round(r / a)
          dst[di + 1] = Math.round(g / a)
          dst[di + 2] = Math.round(b / a)
          dst[di + 3] = Math.round(a / n)
        }
      }
    }
  } else {
    for (let y = 0; y < dstSize; y++) {
      for (let x = 0; x < dstSize; x++) {
        const sx = Math.min(srcW - 1, Math.floor(x * scale))
        const sy = Math.min(srcH - 1, Math.floor(y * scale))
        const si = (sy * srcW + sx) * 4
        const di = (y * dstSize + x) * 4
        dst[di] = src[si]
        dst[di + 1] = src[si + 1]
        dst[di + 2] = src[si + 2]
        dst[di + 3] = src[si + 3]
      }
    }
  }
  return dst
}

function encodeICO(pngBuffers) {
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  const entries = []
  let offset = 6 + count * 16
  const parts = [header]
  for (let i = 0; i < count; i++) {
    const png = pngBuffers[i]
    const size = SIZES[i]
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  parts.push(...entries, ...pngBuffers)
  return Buffer.concat(parts)
}

const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')
const resDir = path.join(root, 'resources')
const pngPath = path.join(resDir, 'icon.png')
const icoPath = path.join(resDir, 'icon.ico')

await fs.mkdir(resDir, { recursive: true })
const pngBuf = await fs.readFile(pngPath)
const { width, height, rgba } = await decodePng(pngBuf)
const frames = []
for (const size of SIZES) {
  const resized = resizeRgba(width, height, rgba, size)
  const frame = await encodePng(size, size, resized)
  frames.push(frame)
  console.log('  frame', size + 'x' + size, frame.length, 'bytes')
}
const ico = encodeICO(frames)
await fs.writeFile(icoPath, ico)
console.log(
  'icon.ico written from',
  pngPath,
  `(${SIZES.join(',')} PNG frames) →`,
  icoPath,
  `(${ico.length} bytes)`,
)