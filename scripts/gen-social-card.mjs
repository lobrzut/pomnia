#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Render the GitHub / social preview card.
 *
 * Until this existed, every link to the repository produced GitHub's default
 * grey card: name, description, a language bar. Shared into Slack, Discord or a
 * group chat it looked like a placeholder — a poor showing for a project whose
 * central problem is being invisible until somebody explains it.
 *
 * Two variants, because the first one did not work:
 *
 *   hub  (default) — the tools you already have, and the one memory under them.
 *   ask            — the same question answered twice, with and without recall.
 *
 * `ask` was the first attempt and it failed its own test. It asks the reader to
 * study two panels and compare them, which is a task rather than a glance; it
 * shows no product at all, so it could advertise anything; and it leans on an
 * invented scenario about p99 latency, which is jargon dressed as plain speech.
 * `hub` asks for recognition instead of comprehension — the reader sees names
 * off their own taskbar, and the structure does the explaining.
 *
 * A script rather than an exported image, for the reason terminal demos are
 * recorded from tape files now: the message keeps changing, and it should
 * regenerate rather than wait for somebody to find the source document.
 *
 *   node scripts/gen-social-card.mjs                       # -> docs/assets
 *   node scripts/gen-social-card.mjs --variant ask --lang pl
 *
 * Upload the result at Settings -> General -> Social preview (1280x640).
 */
import { createCanvas } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
const lang = flag('--lang', 'en')
const variant = flag('--variant', 'hub')

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

/* The clients Connect actually generates a snippet for. Recognition is the
   whole mechanism here, so these must be the real names, not a category. */
const TOOLS = ['Claude Code', 'Cursor', 'Claude Desktop', 'VS Code', 'Antigravity']

const NL = String.fromCharCode(10)

const COPY = {
  en: {
    kicker: 'POMNIA',
    hubHead: 'Every assistant you use.' + NL + 'One memory. On your disk.',
    hubProblem: 'Each keeps its own history, and none of them can read the others.',
    vaultTitle: 'Your vault — a folder you own',
    vaultSub: '2415 notes  ·  AES-256-GCM  ·  read over MCP',
    footL: 'Runs on your hardware  ·  no cloud  ·  AGPL',
    footR: 'pomnia.ai',
    question: '“Why did we drop the Redis cache?”',
    leftLabel: 'ANY ASSISTANT, ANY NEW CHAT',
    leftBody: 'I don’t have context from your' + NL + 'previous conversations.',
    rightLabel: 'THE SAME QUESTION, WITH POMNIA',
    rightBody: 'On 12 March you dropped it —' + NL + 'cold starts pushed p99 over 400 ms.',
    rightCite: 'vault/distilled/2026-03-12_cache.md',
    askKicker: 'POMNIA  ·  ONE ENCRYPTED MEMORY YOUR AI AGENTS SHARE',
  },
  pl: {
    kicker: 'POMNIA',
    hubHead: 'Każdy asystent, którego używasz.' + NL + 'Jedna pamięć. Na Twoim dysku.',
    hubProblem: 'Każdy trzyma własną historię i żaden nie umie przeczytać pozostałych.',
    vaultTitle: 'Twój sejf — folder, który należy do Ciebie',
    vaultSub: '2415 notatek  ·  AES-256-GCM  ·  czytane przez MCP',
    footL: 'Działa na Twoim sprzęcie  ·  bez chmury  ·  AGPL',
    footR: 'pomnia.ai',
    question: '„Czemu odpuściliśmy cache w Redisie?”',
    leftLabel: 'DOWOLNY ASYSTENT, NOWY CZAT',
    leftBody: 'Nie mam kontekstu z Twoich' + NL + 'poprzednich rozmów.',
    rightLabel: 'TO SAMO PYTANIE, Z POMNIĄ',
    rightBody: '12 marca odpuściłeś —' + NL + 'zimne starty wypchnęły p99 ponad 400 ms.',
    rightCite: 'vault/distilled/2026-03-12_cache.md',
    askKicker: 'POMNIA  ·  JEDNA ZASZYFROWANA PAMIĘĆ DLA WSZYSTKICH TWOICH AGENTÓW',
  },
}

const W = 1280
const H = 640
const canvas = createCanvas(W, H)
const c = canvas.getContext('2d')
const t = COPY[lang] ?? COPY.en

/* ── primitives ─────────────────────────────────────────────────────────── */

function text(str, x, y, { font, size, color, weight = '400', spacing = 0, align = 'left' }) {
  c.font = `${weight} ${size}px ${font}`
  c.fillStyle = color
  c.textBaseline = 'alphabetic'
  if (!spacing) {
    c.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
    c.fillText(str, x, y)
    return
  }
  // Canvas has no letterSpacing here, so lay tracked labels out by hand.
  c.textAlign = 'left'
  let cx = x
  if (align === 'center') {
    let total = 0
    for (const ch of str) total += c.measureText(ch).width + spacing
    cx = x - total / 2
  }
  for (const ch of str) {
    c.fillText(ch, cx, y)
    cx += c.measureText(ch).width + spacing
  }
}

/**
 * Draw a block, shrinking until the longest line fits `maxW`.
 *
 * Polish copy runs about 15% longer than English for the same sentence and went
 * straight through a panel border on the first render. Copy keeps changing and
 * nobody re-measures by eye, so each box enforces its own edge.
 */
function lines(str, x, y, lh, maxW, opts) {
  const rows = str.split(NL)
  let size = opts.size
  for (; size > 12; size--) {
    c.font = `${opts.weight ?? '400'} ${size}px ${opts.font}`
    if (rows.every((r) => c.measureText(r).width <= maxW)) break
  }
  const scale = size / opts.size
  rows.forEach((ln, i) => text(ln, x, y + i * lh * scale, { ...opts, size }))
}

function box(x, y, w, h, { stroke, fill = 'rgba(255,255,255,0.022)', glow, radius = 12 }) {
  c.save()
  c.beginPath()
  c.roundRect(x, y, w, h, radius)
  c.fillStyle = fill
  c.fill()
  if (glow) {
    c.shadowColor = glow
    c.shadowBlur = 26
  }
  c.strokeStyle = stroke
  c.lineWidth = glow ? 1.6 : 1
  c.stroke()
  c.restore()
}

function ground() {
  const g = c.createLinearGradient(0, 0, W * 0.35, H)
  g.addColorStop(0, ABYSS)
  g.addColorStop(1, VOID)
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
}

/* ── variant: hub ───────────────────────────────────────────────────────── */

function drawHub() {
  ground()

  /* Bloom under the vault: the eye should land on the thing being offered. */
  const bloom = c.createRadialGradient(W / 2, 512, 0, W / 2, 512, 520)
  bloom.addColorStop(0, 'rgba(34,211,238,0.14)')
  bloom.addColorStop(1, 'rgba(34,211,238,0)')
  c.fillStyle = bloom
  c.fillRect(0, 0, W, H)

  text(t.kicker, 64, 56, { font: SANS, size: 17, color: CYAN, weight: '700', spacing: 3.4 })

  /* Reading order is problem, promise, your tools, the thing. The first draft
     put the headline between the tool row and the vault, where the converging
     curves ran straight through it and made the one line that has to land the
     hardest thing on the card to read. The curve zone is kept empty now. */
  text(t.hubProblem, W / 2, 100, { font: SANS, size: 20, color: INK_FAINT, align: 'center' })
  lines(t.hubHead, W / 2, 152, 46, W - 160, { font: SANS, size: 39, color: INK, weight: '600', align: 'center' })

  const TW = 212
  const TH = 76
  const gap = 16
  const rowW = TOOLS.length * TW + (TOOLS.length - 1) * gap
  const rowX = (W - rowW) / 2
  const rowY = 232
  const anchors = []

  TOOLS.forEach((name, i) => {
    const x = rowX + i * (TW + gap)
    box(x, rowY, TW, TH, { stroke: 'rgba(91,97,120,0.5)' })
    text(name, x + TW / 2, rowY + 33, { font: SANS, size: 19, color: INK, weight: '600', align: 'center' })
    /* Each tool's own scrap of memory: a few marks, connected to nothing. */
    for (let d = 0; d < 5; d++) {
      c.beginPath()
      c.arc(x + TW / 2 - 32 + d * 16, rowY + 55, 2.6, 0, Math.PI * 2)
      c.fillStyle = 'rgba(91,97,120,0.75)'
      c.fill()
    }
    anchors.push(x + TW / 2)
  })

  /* Vault, and the curves that make it the answer rather than a sixth box. */
  const vy = 462
  const vh = 96
  const vx = 148
  const vw = W - vx * 2

  c.save()
  c.strokeStyle = 'rgba(34,211,238,0.38)'
  c.lineWidth = 1.4
  for (const ax of anchors) {
    c.beginPath()
    c.moveTo(ax, rowY + TH)
    c.bezierCurveTo(ax, rowY + TH + 96, W / 2, vy - 96, W / 2, vy)
    c.stroke()
  }
  c.restore()

  box(vx, vy, vw, vh, {
    stroke: 'rgba(34,211,238,0.6)',
    glow: 'rgba(34,211,238,0.32)',
    fill: 'rgba(34,211,238,0.045)',
  })
  text(t.vaultTitle, W / 2, vy + 42, { font: SANS, size: 24, color: INK, weight: '600', align: 'center' })
  text(t.vaultSub, W / 2, vy + 72, { font: MONO, size: 16, color: CYAN, align: 'center' })

  text(t.footL, 64, 604, { font: SANS, size: 17, color: INK_DIM })
  text(t.footR, W - 64, 604, { font: SANS, size: 17, color: CYAN, weight: '600', align: 'right' })
}

/* ── variant: ask (kept so the two can be compared) ─────────────────────── */

function drawAsk() {
  ground()
  const bloom = c.createRadialGradient(880, 400, 0, 880, 400, 460)
  bloom.addColorStop(0, 'rgba(34,211,238,0.13)')
  bloom.addColorStop(1, 'rgba(34,211,238,0)')
  c.fillStyle = bloom
  c.fillRect(0, 0, W, H)

  text(t.askKicker, 72, 84, { font: SANS, size: 17, color: CYAN, weight: '600', spacing: 2.4 })
  lines(t.question, 72, 168, 60, W - 144, { font: SANS, size: 52, color: INK, weight: '600' })

  const PY = 232
  const PH = 236
  const PW = 528
  box(72, PY, PW, PH, { stroke: 'rgba(91,97,120,0.55)', radius: 14 })
  box(680, PY, PW, PH, { stroke: 'rgba(34,211,238,0.55)', glow: 'rgba(34,211,238,0.30)', radius: 14 })

  text(t.leftLabel, 108, PY + 48, { font: SANS, size: 14, color: INK_FAINT, weight: '700', spacing: 1.7 })
  lines(t.leftBody, 108, PY + 100, 40, PW - 72, { font: SANS, size: 27, color: INK_FAINT })
  text(t.rightLabel, 716, PY + 48, { font: SANS, size: 14, color: MINT, weight: '700', spacing: 1.7 })
  lines(t.rightBody, 716, PY + 100, 40, PW - 72, { font: SANS, size: 27, color: INK })
  text(t.rightCite, 716, PY + 196, { font: MONO, size: 17, color: CYAN })

  c.strokeStyle = 'rgba(91,97,120,0.32)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(72, 548)
  c.lineTo(W - 72, 548)
  c.stroke()
  text(t.footL, 72, 590, { font: SANS, size: 19, color: INK_DIM })
  text(t.footR, W - 72, 590, { font: SANS, size: 19, color: CYAN, weight: '600', align: 'right' })
}

if (variant === 'ask') drawAsk()
else drawHub()

// docs/assets rather than build/: build/ is gitignored, and a README pointing at
// an uncommitted image shows every visitor a broken-image icon, which is worse
// than the plain text it replaced.
const outDir = join(root, 'docs', 'assets')
mkdirSync(outDir, { recursive: true })
const name = variant === 'ask' ? `social-card-ask-${lang}.png` : `social-card-${lang}.png`
const out = join(outDir, name)
const png = canvas.toBuffer('image/png')
writeFileSync(out, png)

console.log(`${out}  ${W}x${H}  ${(png.length / 1024).toFixed(0)} KB  [${variant}/${lang}]`)
