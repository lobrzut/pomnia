// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Core dedupe-vault-session-notes logic (run via scripts/dedupe-vault-session-notes.mjs).
 *
 * Group notes by 8-char sessionId filename suffix across distilled/_weak/_review.
 * Keep ONE file per session — basket priority beats mtime:
 *   1. distilled/ (keep) always wins
 *   2. _weak/ beats _review/
 *   3. same basket → newest mtime
 *
 * Contested: basket-winner is older than a discarded twin (newer distill scored
 * the session into a worse basket) — report for quality-score instability;
 * still delete by basket rule (never drop an indexed note for a non-indexed one).
 *
 * After --apply, reindex is required (library.db still lists deleted paths).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  hasContentlessStubMarker,
  hasThinSearchableSections,
} from '../src/core/brain/qualityGate.ts'

export type Basket = 'keep' | 'weak' | 'review'

/** Higher = preferred. distilled > _weak > _review. */
export const BASKET_RANK: Record<Basket, number> = {
  keep: 3,
  weak: 2,
  review: 1,
}

export interface NoteFile {
  path: string
  name: string
  session8: string
  basket: Basket
  mtimeMs: number
  hasContent: boolean
}

export interface DedupePlan {
  session8: string
  keep: NoteFile
  delete: NoteFile[]
  /**
   * Basket-winner is older than at least one discarded twin — signal that a
   * newer distill scored the session into a worse basket (quality instability).
   */
  contested: boolean
  reason: string
}

function parseArgs(argv: string[]): { vault: string; apply: boolean; help: boolean } {
  let vault = 'C:\\Vault'
  let apply = false
  let help = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--apply') apply = true
    else if (a === '--dry-run') apply = false
    else if (a === '--help' || a === '-h') help = true
    else if (a === '--vault') vault = argv[++i] ?? vault
    else if (a.startsWith('--vault=')) vault = a.slice('--vault='.length)
  }
  return { vault: resolve(vault), apply, help }
}

/** Trailing `_${8}.md` — same suffix deploy.ts uses for session identity. */
export function session8FromFilename(name: string): string | null {
  const m = basename(name).match(/_([A-Za-z0-9]{8})\.md$/i)
  return m ? m[1]!.toLowerCase() : null
}

export function basketForPath(distilledRoot: string, filePath: string): Basket {
  const rel = relative(distilledRoot, filePath).replace(/\\/g, '/')
  if (rel.startsWith('_review/') || rel === '_review') return 'review'
  if (rel.startsWith('_weak/') || rel === '_weak') return 'weak'
  return 'keep'
}

export function noteHasContent(markdown: string): boolean {
  if (hasThinSearchableSections(markdown)) return true
  if (hasContentlessStubMarker(markdown)) return false
  const body = markdown.startsWith('---')
    ? (() => {
        const end = markdown.indexOf('\n---', 3)
        return end >= 0 ? markdown.slice(end + 4).trim() : markdown.trim()
      })()
    : markdown.trim()
  return body.length >= 40
}

function listBasketMd(distilled: string): NoteFile[] {
  const out: NoteFile[] = []
  const dirs: { dir: string; basket: Basket }[] = [
    { dir: distilled, basket: 'keep' },
    { dir: join(distilled, '_weak'), basket: 'weak' },
    { dir: join(distilled, '_review'), basket: 'review' },
  ]
  for (const { dir, basket } of dirs) {
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md') || name.startsWith('.')) continue
      // Only top-level of each basket (no nested dirs under keep).
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (!st.isFile()) continue
      const session8 = session8FromFilename(name)
      if (!session8) continue
      let md = ''
      try {
        md = readFileSync(p, 'utf8')
      } catch {
        /* empty */
      }
      out.push({
        path: p,
        name,
        session8,
        basket,
        mtimeMs: st.mtimeMs,
        hasContent: noteHasContent(md),
      })
    }
  }
  return out
}

/**
 * Basket priority beats mtime: keep > weak > review; same basket → newest.
 * Contested when the basket-winner is older than a discarded twin.
 */
export function pickKeeper(files: NoteFile[]): {
  keep: NoteFile
  contested: boolean
  reason: string
} {
  if (files.length === 0) {
    throw new Error('pickKeeper: empty group')
  }
  const sorted = [...files].sort((a, b) => {
    const rank = BASKET_RANK[b.basket] - BASKET_RANK[a.basket]
    if (rank !== 0) return rank
    return b.mtimeMs - a.mtimeMs
  })
  const keep = sorted[0]!
  const discarded = files.filter((f) => f.path !== keep.path)
  const contested = discarded.some((d) => d.mtimeMs > keep.mtimeMs)

  const sameBasket = discarded.every((d) => d.basket === keep.basket)
  let reason: string
  if (sameBasket) {
    reason = 'newest by mtime (same basket)'
  } else if (contested) {
    reason = `basket priority (${keep.basket} > discarded) — winner older than discarded twin (contested)`
  } else {
    reason = `basket priority (${keep.basket})`
  }

  return { keep, contested, reason }
}

export function planDedupe(files: NoteFile[]): DedupePlan[] {
  const bySession = new Map<string, NoteFile[]>()
  for (const f of files) {
    const list = bySession.get(f.session8) ?? []
    list.push(f)
    bySession.set(f.session8, list)
  }
  const plans: DedupePlan[] = []
  for (const [session8, group] of bySession) {
    if (group.length < 2) continue
    const { keep, contested, reason } = pickKeeper(group)
    const del = group.filter((f) => f.path !== keep.path)
    plans.push({ session8, keep, delete: del, contested, reason })
  }
  plans.sort((a, b) => a.session8.localeCompare(b.session8))
  return plans
}

export function runDedupe(argv: string[] = process.argv.slice(2)): {
  plans: DedupePlan[]
  apply: boolean
  vault: string
} {
  const opts = parseArgs(argv)
  if (opts.help) {
    console.log(`Usage: node scripts/dedupe-vault-session-notes.mjs [--vault C:\\Vault] [--apply]

  --dry-run   (default) print plan, no deletes
  --apply     delete duplicate notes (one kept per sessionId8)
  --vault     vault root (default C:\\Vault)

Identity: source + sessionId; FS key = trailing _XXXXXXXX.md across
  distilled/, distilled/_weak/, distilled/_review/

Keep rule (basket beats mtime):
  1. distilled/ always wins
  2. _weak/ beats _review/
  3. same basket → newest mtime

Contested: basket-winner older than a discarded twin → reported (quality-score
  instability); still apply basket rule so indexed notes are never dropped for
  non-indexed ones.

After --apply: reindex the library (deleted files leave library.db stale).`)
    return { plans: [], apply: false, vault: opts.vault }
  }

  const distilled = join(opts.vault, 'distilled')
  if (!existsSync(distilled)) {
    throw new Error(`No distilled/ under ${opts.vault}`)
  }

  const files = listBasketMd(distilled)
  const plans = planDedupe(files)
  const uniqueSessions = new Set(files.map((f) => f.session8)).size
  const extras = files.length - uniqueSessions

  console.log(`Vault: ${opts.vault}`)
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY-RUN (default)'}`)
  console.log(
    `Notes with sessionId8 suffix: ${files.length} files, ${uniqueSessions} unique sessions, ${extras} extras`,
  )
  console.log(`Duplicate groups: ${plans.length}`)

  const contested = plans.filter((p) => p.contested)
  if (contested.length) {
    console.log(
      `\nContested (${contested.length}) — basket-winner older than discarded twin (quality-score instability):`,
    )
    for (const p of contested) {
      console.log(`  session=${p.session8}`)
      console.log(`    KEEP  [${p.keep.basket}] mtime=${new Date(p.keep.mtimeMs).toISOString()} ${p.keep.path}`)
      for (const d of p.delete) {
        console.log(
          `    DROP  [${d.basket}] mtime=${new Date(d.mtimeMs).toISOString()} ${d.path}`,
        )
      }
    }
  }

  const normal = plans.filter((p) => !p.contested)
  console.log(`\nAuto dedupe (${normal.length}):`)
  for (const p of normal.slice(0, 40)) {
    console.log(`  session=${p.session8} keep=[${p.keep.basket}] ${basename(p.keep.path)}`)
    for (const d of p.delete) {
      console.log(`    drop=[${d.basket}] ${basename(d.path)}`)
    }
  }
  if (normal.length > 40) console.log(`  … +${normal.length - 40} more groups`)

  const toDelete = plans.reduce((n, p) => n + p.delete.length, 0)
  console.log(`\nWould delete: ${toDelete} files (keep ${plans.length} winners)`)
  if (contested.length) {
    console.log(`Contested groups (reported above): ${contested.length}`)
  }

  if (!opts.apply) {
    console.log('\nNo changes written. Re-run with --apply after reviewing.')
    console.log('COPY the vault before --apply.')
    console.log('After --apply: reindex required (library.db goes stale when files are deleted).')
    return { plans, apply: false, vault: opts.vault }
  }

  let deleted = 0
  for (const p of plans) {
    for (const d of p.delete) {
      try {
        unlinkSync(d.path)
        deleted++
      } catch (e) {
        console.error(`Failed to delete ${d.path}:`, (e as Error).message)
      }
    }
  }
  console.log(`\nApplied: deleted ${deleted} duplicate files`)
  console.log('REINDEX REQUIRED — deleted files leave library.db stale.')
  return { plans, apply: true, vault: opts.vault }
}

const thisFile = fileURLToPath(import.meta.url)
const invoked = process.argv[1] ? resolve(process.argv[1]) : ''
if (invoked && resolve(thisFile) === invoked) {
  try {
    runDedupe()
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
}
