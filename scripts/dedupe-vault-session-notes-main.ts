// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Core dedupe-vault-session-notes logic (run via scripts/dedupe-vault-session-notes.mjs).
 *
 * Group notes by 8-char sessionId filename suffix across distilled/_weak/_review.
 * Keep ONE file per session — newest by mtime — with an asymmetric safety rule:
 * if the newest is in _review/ and an older keep (distilled/) note has content,
 * keep the distilled one and report for manual decision (do not hide content
 * behind automation).
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
  /** Newest was _review/ but contentful distilled/ was preferred — review manually. */
  manualReview: boolean
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
 * Prefer newest by mtime; asymmetric: newest in _review/ + older keep with
 * content → keep the distilled note (manual review).
 */
export function pickKeeper(files: NoteFile[]): { keep: NoteFile; manualReview: boolean; reason: string } {
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)
  const newest = sorted[0]!
  if (newest.basket === 'review') {
    const contentfulKeep = sorted
      .filter((f) => f.basket === 'keep' && f.hasContent && f.path !== newest.path)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    if (contentfulKeep) {
      return {
        keep: contentfulKeep,
        manualReview: true,
        reason:
          'newest in _review/ but older distilled/ has content — kept distilled; decide manually',
      }
    }
  }
  return {
    keep: newest,
    manualReview: false,
    reason: 'newest by mtime',
  }
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
    const { keep, manualReview, reason } = pickKeeper(group)
    const del = group.filter((f) => f.path !== keep.path)
    plans.push({ session8, keep, delete: del, manualReview, reason })
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

Keep rule: newest mtime wins — EXCEPT when newest is in _review/ and an
  older distilled/ note has content → keep distilled and flag for manual review.

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

  const manual = plans.filter((p) => p.manualReview)
  if (manual.length) {
    console.log(`\nManual review (${manual.length}) — newest was _review/, kept contentful distilled/:`)
    for (const p of manual) {
      console.log(`  session=${p.session8}`)
      console.log(`    KEEP  [${p.keep.basket}] ${p.keep.path}`)
      for (const d of p.delete) {
        console.log(`    DROP  [${d.basket}] ${d.path}`)
      }
    }
  }

  const auto = plans.filter((p) => !p.manualReview)
  console.log(`\nAuto dedupe (${auto.length}):`)
  for (const p of auto.slice(0, 40)) {
    console.log(`  session=${p.session8} keep=[${p.keep.basket}] ${basename(p.keep.path)}`)
    for (const d of p.delete) {
      console.log(`    drop=[${d.basket}] ${basename(d.path)}`)
    }
  }
  if (auto.length > 40) console.log(`  … +${auto.length - 40} more groups`)

  const toDelete = plans.reduce((n, p) => n + p.delete.length, 0)
  console.log(`\nWould delete: ${toDelete} files (keep ${plans.length} winners)`)

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
