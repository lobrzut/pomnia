/**
 * Download / refresh Tesseract traineddata into resources/tessdata for Electron extraResources.
 * Uses tessdata_fast (smaller) — eng + pol. Apache-2.0 / Apache-2.0 tessdata.
 *
 * Usage: node scripts/stage-tessdata.mjs
 */

import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { gzipSync } from 'node:zlib'
import { Readable } from 'node:stream'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'resources', 'tessdata')

/** Naptha CDN mirrors tessdata_fast as .gz (tesseract.js default). */
const LANGS = [
  {
    code: 'eng',
    url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_fast_int/eng.traineddata.gz',
  },
  {
    code: 'pol',
    url: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/pol@1.0.0/4.0.0_fast_int/pol.traineddata.gz',
  },
]

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const body = res.body
  if (!body) throw new Error(`No body for ${url}`)
  await pipeline(Readable.fromWeb(body), createWriteStream(dest))
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  for (const { code, url } of LANGS) {
    const dest = join(outDir, `${code}.traineddata.gz`)
    if (existsSync(dest) && statSync(dest).size > 1000) {
      console.log(`[tessdata] keep ${code}.traineddata.gz (${statSync(dest).size} bytes)`)
      continue
    }
    console.log(`[tessdata] download ${code}…`)
    try {
      await download(url, dest)
      console.log(`[tessdata] wrote ${dest} (${statSync(dest).size} bytes)`)
    } catch (e) {
      // Fallback: GitHub tessdata_fast raw (uncompressed) → gzip for tesseract.js
      const rawUrl = `https://github.com/tesseract-ocr/tessdata_fast/raw/main/${code}.traineddata`
      console.warn(`[tessdata] CDN failed (${e.message}); trying ${rawUrl}`)
      const res = await fetch(rawUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${rawUrl}`)
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(dest, gzipSync(buf))
      console.log(`[tessdata] wrote ${dest} from GitHub (${statSync(dest).size} bytes)`)
    }
  }
  console.log(`[tessdata] ready → ${outDir}`)
}

main().catch((e) => {
  console.error('[tessdata] failed:', e)
  process.exit(1)
})
