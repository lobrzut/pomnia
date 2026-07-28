// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Core migrate-vault-quality logic (run via scripts/migrate-vault-quality.mjs).
 *
 * Label wins when present. Unrated notes get scoreFields → quality + quality_score_ts.
 * Existing quality_score is never overwritten (0–10 and 0–100 scales coexist).
 */
import { createHash, randomInt } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  destinationForQuality,
  destDir,
  parseFrontmatterQuality,
  parseFrontmatterScore,
  pathMatchesDestination,
  rateUnratedMarkdown,
  upsertQualityFrontmatter,
  type QualityDestination,
} from '../src/core/brain/qualityGate.ts'

export interface PlanItem {
  from: string
  to: string
  dest: QualityDestination
  quality: string
  /** Legacy quality_score when present — never used for thresholds. */
  oldScore: number | null
  /** Newly computed TS score (unrated only). */
  scoreTs: number | null
  action: 'move' | 'rate+move' | 'rate' | 'skip'
  /** True when note already had a quality: label (label trusted). */
  labeled: boolean
  preview: string
}

function parseArgs(argv: string[]): {
  vault: string
  apply: boolean
  seed: number
  help: boolean
} {
  let vault = 'C:\\Vault'
  let apply = false
  let seed = 0
  let help = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--apply') apply = true
    else if (a === '--dry-run') apply = false
    else if (a === '--help' || a === '-h') help = true
    else if (a === '--vault') vault = argv[++i] ?? vault
    else if (a.startsWith('--vault=')) vault = a.slice('--vault='.length)
    else if (a === '--seed') seed = Number(argv[++i] ?? 0) || 0
    else if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length)) || 0
  }
  return { vault: resolve(vault), apply, seed, help }
}

function listMdRecursive(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) listMdRecursive(p, acc)
    else if (name.endsWith('.md')) acc.push(p)
  }
  return acc
}

function previewBody(md: string, n = 300): string {
  const body = md.startsWith('---')
    ? (() => {
        const end = md.indexOf('\n---', 3)
        return end >= 0 ? md.slice(end + 4).trimStart() : md
      })()
    : md
  return body.replace(/\s+/g, ' ').trim().slice(0, n)
}

function shuffleInPlace<T>(arr: T[], seed: number): void {
  let s =
    seed ||
    createHash('sha256')
      .update(String(Date.now()))
      .digest()
      .readUInt32BE(0)
  const rnd = (): number => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0xffffffff
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

/**
 * Plan one file.
 * HAS quality: → trust label, ignore score, maybe move.
 * NO quality:  → scoreFields + asymmetric label + quality_score_ts.
 */
export function planForFile(distilled: string, filePath: string): PlanItem | null {
  const norm = filePath.replace(/\\/g, '/')
  if (!norm.toLowerCase().includes('/distilled/')) return null

  const md = readFileSync(filePath, 'utf8')
  const existingQuality = parseFrontmatterQuality(md)
  const oldScore = parseFrontmatterScore(md)

  if (existingQuality) {
    const dest = destinationForQuality(existingQuality)
    if (pathMatchesDestination(filePath, dest)) {
      return {
        from: filePath,
        to: filePath,
        dest,
        quality: existingQuality,
        oldScore,
        scoreTs: null,
        action: 'skip',
        labeled: true,
        preview: previewBody(md),
      }
    }
    const to = join(destDir(distilled, dest), basename(filePath))
    return {
      from: filePath,
      to,
      dest,
      quality: existingQuality,
      oldScore,
      scoreTs: null,
      action: 'move',
      labeled: true,
      preview: previewBody(md),
    }
  }

  // Unrated: recompute via TS scoreFields — never compare legacy scores.
  const rated = rateUnratedMarkdown(md)
  const dest = destinationForQuality(rated.quality)
  const to = join(destDir(distilled, dest), basename(filePath))
  const alreadyHome = pathMatchesDestination(filePath, dest)
  const action: PlanItem['action'] = alreadyHome
    ? dest === 'keep'
      ? 'rate'
      : 'rate'
    : 'rate+move'

  return {
    from: filePath,
    to: alreadyHome ? filePath : to,
    dest,
    quality: rated.quality,
    oldScore: null,
    scoreTs: rated.score,
    action: alreadyHome ? 'rate' : 'rate+move',
    labeled: false,
    preview: previewBody(md),
  }
}

function printSample(label: string, items: PlanItem[], n: number, seed: number): void {
  const pool = items.filter((i) => i.action !== 'skip')
  const copy = [...pool]
  shuffleInPlace(copy, seed || randomInt(1, 1e9))
  const pick = copy.slice(0, n)
  console.log(`\n=== ${label} (${pick.length} of ${pool.length} pending) ===`)
  for (const it of pick) {
    console.log(`\n${it.from}`)
    console.log(`  → ${it.to}`)
    console.log(
      `  quality=${it.quality} score_ts=${it.scoreTs ?? 'n/a'} old_score=${it.oldScore ?? 'n/a'} labeled=${it.labeled} action=${it.action}`,
    )
    console.log(`  preview: ${it.preview}`)
  }
}

/** Distribution of legacy quality_score by quality: label (proof we ignore scores for moves). */
export function printOldScoreDistribution(plans: PlanItem[]): void {
  type Acc = { n: number; withScore: number; min: number; max: number; sum: number; gt10: number; le10: number }
  const by = new Map<string, Acc>()
  for (const p of plans) {
    if (!p.labeled) continue
    const key = p.quality.toLowerCase()
    let a = by.get(key)
    if (!a) {
      a = { n: 0, withScore: 0, min: Infinity, max: -Infinity, sum: 0, gt10: 0, le10: 0 }
      by.set(key, a)
    }
    a.n++
    if (p.oldScore != null) {
      a.withScore++
      a.min = Math.min(a.min, p.oldScore)
      a.max = Math.max(a.max, p.oldScore)
      a.sum += p.oldScore
      if (p.oldScore > 10) a.gt10++
      else a.le10++
    }
  }
  console.log('\n=== OLD quality_score distribution by label (IGNORED for routing) ===')
  console.log('label | n | with_score | min | max | avg | n<=10 | n>10')
  const keys = [...by.keys()].sort()
  for (const k of keys) {
    const a = by.get(k)!
    const avg = a.withScore ? (a.sum / a.withScore).toFixed(2) : 'n/a'
    const min = a.withScore ? a.min.toFixed(2) : 'n/a'
    const max = a.withScore ? a.max.toFixed(2) : 'n/a'
    console.log(
      `${k} | ${a.n} | ${a.withScore} | ${min} | ${max} | ${avg} | ${a.le10} | ${a.gt10}`,
    )
  }
  const unlabeled = plans.filter((p) => !p.labeled).length
  console.log(`unlabeled (no quality:) | ${unlabeled} — scored via scoreFields → quality_score_ts`)
  console.log(
    'Note: n>10 proves a 0–100 scale coexists with 0–10; routing uses labels only.',
  )
}

function applyPlan(p: PlanItem): void {
  if (p.action === 'skip') return
  let body = readFileSync(p.from, 'utf8')
  if (p.action === 'rate' || p.action === 'rate+move') {
    body = upsertQualityFrontmatter(body, p.quality, p.scoreTs ?? 0)
  }
  if (p.from === p.to) {
    writeFileSync(p.from, body, 'utf8')
    return
  }
  mkdirSync(dirname(p.to), { recursive: true })
  writeFileSync(p.to, body, 'utf8')
  if (existsSync(p.from) && resolve(p.from) !== resolve(p.to)) {
    try {
      unlinkSync(p.from)
    } catch {
      // fallback: try rename if unlink failed mid-write
      try {
        renameSync(p.from, p.to + '.bak-src')
        unlinkSync(p.to + '.bak-src')
      } catch {
        /* leave source; idempotent re-run will skip once dest exists */
      }
    }
  }
}

export function runMigration(argv: string[] = process.argv.slice(2)): {
  plans: PlanItem[]
  apply: boolean
  vault: string
} {
  const opts = parseArgs(argv)
  if (opts.help) {
    console.log(`Usage: node scripts/migrate-vault-quality.mjs [--vault C:\\Vault] [--apply] [--seed N]

  --dry-run   (default) print plan + samples, no writes
  --apply     write quality/quality_score_ts + move files
  --vault     vault root (default C:\\Vault)
  --seed      RNG seed for sample selection

Rules:
  quality: present → trust label, ignore quality_score
  no label        → scoreFields (TS) → quality + quality_score_ts
  never overwrite existing quality_score`)
    return { plans: [], apply: false, vault: opts.vault }
  }

  const distilled = join(opts.vault, 'distilled')
  if (!existsSync(distilled)) {
    throw new Error(`No distilled/ under ${opts.vault}`)
  }

  const files = listMdRecursive(distilled)
  const plans: PlanItem[] = []
  for (const f of files) {
    const p = planForFile(distilled, f)
    if (p) plans.push(p)
  }

  const counts = {
    total: plans.length,
    skip: plans.filter((p) => p.action === 'skip').length,
    move: plans.filter((p) => p.action === 'move').length,
    rate: plans.filter((p) => p.action === 'rate').length,
    rateMove: plans.filter((p) => p.action === 'rate+move').length,
    toReview: plans.filter((p) => p.dest === 'review' && p.action !== 'skip').length,
    toWeak: plans.filter((p) => p.dest === 'weak' && p.action !== 'skip').length,
    stay: plans.filter((p) => p.dest === 'keep' && p.action !== 'skip').length,
    labeled: plans.filter((p) => p.labeled).length,
    unlabeled: plans.filter((p) => !p.labeled).length,
  }

  console.log(`Vault: ${opts.vault}`)
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN (default)'}`)
  console.log(`Notes scanned: ${counts.total} (labeled=${counts.labeled}, unlabeled=${counts.unlabeled})`)
  console.log(
    `Plan: move=${counts.move} rate=${counts.rate} rate+move=${counts.rateMove} skip=${counts.skip}`,
  )
  console.log(
    `Destinations (pending): _review=${counts.toReview} _weak=${counts.toWeak} stay=${counts.stay}`,
  )

  printOldScoreDistribution(plans)

  const toWeak = plans.filter((p) => p.dest === 'weak' && p.action !== 'skip')
  const toReview = plans.filter((p) => p.dest === 'review' && p.action !== 'skip')
  const stay = plans.filter((p) => p.dest === 'keep' && p.action !== 'skip')
  const stayPool = stay.length >= 5 ? stay : plans.filter((p) => p.dest === 'keep')

  printSample('10 random → _weak', toWeak, 10, opts.seed || 1)
  printSample('10 random → _review', toReview, 10, opts.seed || 2)
  printSample('5 random stay distilled/', stayPool, 5, opts.seed || 3)

  if (!opts.apply) {
    console.log('\nNo changes written. Re-run with --apply after reviewing samples.')
    console.log('COPY C:\\Vault before --apply.')
    return { plans, apply: false, vault: opts.vault }
  }

  mkdirSync(join(distilled, '_review'), { recursive: true })
  mkdirSync(join(distilled, '_weak'), { recursive: true })

  let written = 0
  let moved = 0
  for (const p of plans) {
    if (p.action === 'skip') continue
    const before = p.from
    applyPlan(p)
    written++
    if (before !== p.to) moved++
  }

  console.log(`\nApplied: wrote/updated ${written}, moved ${moved}`)
  return { plans, apply: true, vault: opts.vault }
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked && resolve(thisFile) === invoked) {
  try {
    runMigration()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
