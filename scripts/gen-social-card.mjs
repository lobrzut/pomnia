#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Render the GitHub / social preview card.
 *
 * Until now every link to this repository produced GitHub's default grey card:
 * repo name, description, a language bar. Shared into Slack, Discord, X or a
 * group chat it looked like nothing, which is a poor showing for a project
 * whose whole problem is being invisible until you read about it.
 *
 * The card is a script rather than an exported image on purpose — same reason
 * terminal demos are recorded from a tape file. The message will change; when
 * it does, this regenerates instead of someone reopening a design tool.
 *
 *   node scripts/gen-social-card.mjs            # -> docs/assets/*.png
 *   node scripts/gen-social-card.mjs --lang pl
 *
 * Upload the result at Settings -> General -> Social preview (1280x640).
 */
import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en'

/* Brand tokens, lifted from the landing page so the card cannot drift from it. */
const VOID = '#06070d'
const ABYSS = '#0a0c16'
const INK = '#e9ecf5'
const INK_DIM = '#9aa3bd'
const INK_FAINT = '#5b6178'
const CYAN = '#22d3ee'
const MINT = '#34d399'

const SANS = '"Segoe UI", Arial, sans-serif'
const MONO = 'Consolas, "Courier New", monospace'

const COPY = {
  en: {
    kicker: 'POMNIA  ·  ONE ENCRYPTED MEMORY YOUR AI AGENTS SHARE',
    question: '“Why did we drop the Redis cache?”',
    leftLabel: 'ANY ASSISTANT, ANY NEW CHAT',
    leftBody: 'I don’t have context from your\nprevious conversations.',
    rightLabel: 'THE SAME QUESTION, WITH POMNIA',
    rightBody: 'On 12 March you dropped it —\ncold starts pushed p99 over 400 ms.',
    rightCite: 'vault/distilled/2026-03-12_cache.md',
    footL: 'Runs on your hardware  ·  speaks MCP  ·  AGPL',
    footR: 'pomnia.ai',
  },
  pl: {
    kicker: 'POMNIA  ·  JEDNA ZASZYFROWANA PAMIĘĆ DLA WSZYSTKICH TWOICH AGENTÓW',
    question: '„Czemu odpuściliśmy cache w Redisie?”',
    leftLabel: 'DOWOLNY ASYSTENT, NOWY CZAT',
    leftBody: 'Nie mam kontekstu z Twoich\npoprzednich rozmów.',
    rightLabel: 'TO SAMO PYTANIE, Z POMNIĄ',
    rightBody: '12 marca odpuściłeś —\nzimne starty wypchnęły p99 ponad 400 ms.',
    rightCite: 'vault/distilled/2026-03-12_cache.md',
    footL: 'Działa na Twoim sprzęcie  ·  mówi MCP  ·  AGPL',
    footR: 'pomnia.ai',
  },
}

const W = 1280
const H = 640
const canvas = createCanvas(W, H)
const c = canvas.getContext('2d')

/* Ground: a barely-there vertical lift so the card is not a flat rectangle. */
const g = c.createLinearGradient(0, 0, W * 0.35, H)
g.addColorStop(0, ABYSS)
g.addColorStop(1, VOID)
c.fillStyle = g
c.fillRect(0, 0, W, H)

/* One cyan bloom behind the answer that works, so the eye lands there first. */
const bloom = c.createRadialGradient(880, 400, 0, 880, 400, 460)
bloom.addColorStop(0, 'rgba(34,211,238,0.13)')
bloom.addColorStop(1, 'rgba(34,211,238,0)')
c.fillStyle = bloom
c.fillRect(0, 0, W, H)

function text(str, x, y, { font, size, color, weight = '400', spacing = 0, align = 'left' }) {
  c.font = `${weight} ${size}px ${font}`
  c.fillStyle = color
  c.textAlign = 'left'
  c.textBaseline = 'alphabetic'
  if (!spacing) {
    if (align === 'right') c.textAlign = 'right'
    c.fillText(str, x, y)
    return
  }
  // Canvas has no letterSpacing here, so lay the tracked kicker out by hand.
  let cx = x
  for (const ch of str) {
    c.fillText(ch, cx, y)
    cx += c.measureText(ch).width + spacing
  }
}

/**
 * Draw a block, shrinking until the longest line fits `maxW`.
 *
 * The Polish copy runs about 15% longer than the English for the same
 * sentence and went straight through the right border of its panel. Copy will
 * keep changing and nobody re-measures by eye, so the box enforces its own edge.
 */
function lines(str, x, y, lh, maxW, opts) {
  const rows = str.split('\n')
  let size = opts.size
  for (; size > 14; size--) {
    c.font = `${opts.weight ?? '400'} ${size}px ${opts.font}`
    if (rows.every((r) => c.measureText(r).width <= maxW)) break
  }
  const scale = size / opts.size
  rows.forEach((ln, i) => text(ln, x, y + i * lh * scale, { ...opts, size }))
}

function panel(x, y, w, h, { accent, glow }) {
  c.save()
  c.beginPath()
  c.roundRect(x, y, w, h, 14)
  c.fillStyle = 'rgba(255,255,255,0.022)'
  c.fill()
  if (glow) {
    c.shadowColor = 'rgba(34,211,238,0.30)'
    c.shadowBlur = 26
  }
  c.strokeStyle = accent
  c.lineWidth = glow ? 1.6 : 1
  c.stroke()
  c.restore()
}

const t = COPY[lang] ?? COPY.en

/* Kicker */
text(t.kicker, 72, 84, { font: SANS, size: 17, color: CYAN, weight: '600', spacing: 2.4 })

/* The question carries the card. Everything else is evidence for it. */
lines(t.question, 72, 168, 60, W - 144, { font: SANS, size: 52, color: INK, weight: '600' })

/* Two answers, same question. The left one is every reader's Tuesday. */
const PY = 232
const PH = 236
const PW = 528
panel(72, PY, PW, PH, { accent: 'rgba(91,97,120,0.55)' })
panel(680, PY, PW, PH, { accent: 'rgba(34,211,238,0.55)', glow: true })

text(t.leftLabel, 108, PY + 48, { font: SANS, size: 14, color: INK_FAINT, weight: '700', spacing: 1.7 })
lines(t.leftBody, 108, PY + 100, 40, PW - 72, { font: SANS, size: 27, color: INK_FAINT, weight: '400' })

text(t.rightLabel, 716, PY + 48, { font: SANS, size: 14, color: MINT, weight: '700', spacing: 1.7 })
lines(t.rightBody, 716, PY + 100, 40, PW - 72, { font: SANS, size: 27, color: INK, weight: '400' })
text(t.rightCite, 716, PY + 196, { font: MONO, size: 17, color: CYAN, weight: '400' })

/* Footer rule + the two things a stranger still needs. */
c.strokeStyle = 'rgba(91,97,120,0.32)'
c.lineWidth = 1
c.beginPath()
c.moveTo(72, 548)
c.lineTo(W - 72, 548)
c.stroke()

text(t.footL, 72, 590, { font: SANS, size: 19, color: INK_DIM, weight: '400' })
text(t.footR, W - 72, 590, { font: SANS, size: 19, color: CYAN, weight: '600', align: 'right' })

// docs/assets rather than build/: build/ is gitignored, and a README that
// references an image nobody committed renders a broken-image icon to every
// visitor — a worse first impression than the plain text it replaced.
const outDir = join(root, 'docs', 'assets')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `social-card-${lang}.png`)
const png = canvas.toBuffer('image/png')
writeFileSync(out, png)

console.log(`${out}  ${W}x${H}  ${(png.length / 1024).toFixed(0)} KB`)
console.log('Upload: repo Settings -> General -> Social preview')
