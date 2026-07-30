// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Pomnia doctor — shared health diagnostics for CLI (`pomnia doctor`) and UI.
 * Keep formatting and check logic here so surfaces cannot drift.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'

import { detectAll, getAdapter } from './adapters/index.js'
import { isCursorDbTooLarge } from './adapters/cursor.js'
import {
  BUILD_DIRTY,
  BUILD_GIT_SHA,
  BUILD_TIMESTAMP,
  BUILD_VERSION,
  formatBuildIdentity,
} from '../buildInfo.js'
import { PROFILE_EMBED_MODEL, VRAM_PROFILES } from './brain/profiles.js'
import { defaultOllamaConfig, Ollama } from './brain/ollama.js'
import { pingBrain } from './brain/status.js'
import { appDataRoot, currentOS, homeDir } from './platform.js'
import type { SourceId } from './model.js'

export type DoctorLevel = 'OK' | 'WARN' | 'FAIL'

export interface DoctorCheck {
  id: string
  level: DoctorLevel
  /** Short human line (no OK/WARN/FAIL prefix). */
  message: string
  /** Concrete fix command / action when level ≠ OK. */
  action?: string
  data?: Record<string, unknown>
}

export interface DoctorReport {
  checks: DoctorCheck[]
  ok: number
  warn: number
  fail: number
  /** 1 if any FAIL, else 0 (WARN-only still exits 0). */
  exitCode: 0 | 1
  generatedAt: string
}

export interface DoctorOptions {
  /** Vault root (encrypted folder or plaintext knowledge root). */
  vaultPath?: string
  /** Explicit open/closed; when omitted, inferred from path existence. */
  vaultOpen?: boolean
  /** library.db path; default %APPDATA%/Pomnia/brain-core-data/vectordb/library.db */
  libraryDbPath?: string
  /** distill-ledger.json; default under Pomnia userData */
  ledgerPath?: string
  /** Pomnia userData root override */
  userDataDir?: string
  ollamaUrl?: string
  /** Distill chat model from VRAM profile (default: standard). */
  distillModel?: string
  embedModel?: string
  brainUrl?: string
  /** Skip live network / adapter scans (unit tests). */
  skipLive?: boolean
  /** Injected index rows for tests (skips opening library.db). */
  indexFixture?: IndexConsistencyInput
  /** Injected duplicate note paths for tests. */
  duplicateFixture?: string[]
}

export interface DuplicateGroup {
  session8: string
  paths: string[]
  excess: number
}

export interface IndexConsistencyInput {
  indexedPaths: string[]
  /** Distinct pdf_path values from chunks (or paths to count). */
  chunkPaths: string[]
  /** Optional per-path chunk counts; if omitted, each chunkPaths entry counts as 1. */
  chunkCounts?: Record<string, number>
  diskIndexablePaths: string[]
  vaultRoot: string
  /** Override exists check (tests). Default: node `existsSync`. */
  fileExists?: (path: string) => boolean
}

export interface IndexConsistencyResult {
  deadEntries: string[]
  missingFromIndex: string[]
  reviewChunkCount: number
  reviewIndexedFiles: number
  totalIndexedFiles: number
  totalChunks: number
  byExt: { md: number; epub: number; pdf: number; other: number }
  byBasket: { distilled: number; weak: number; review: number; other: number }
}

export interface DistillSourceRow {
  source: SourceId
  label: string
  total: number
  processed: number
  pending: number | null
  uncountableHint?: string
}

/** Normalize for set membership (`\` vs `/`, trailing slash, case). */
export function normalizeDoctorPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Trailing `_${8}.md` session identity (same as dedupe script). */
export function session8FromFilename(name: string): string | null {
  const m = basename(name).match(/_([A-Za-z0-9]{8})\.md$/i)
  return m ? m[1]!.toLowerCase() : null
}

export function findDuplicateSessionGroups(paths: string[]): DuplicateGroup[] {
  const bySession = new Map<string, string[]>()
  for (const p of paths) {
    const s8 = session8FromFilename(p)
    if (!s8) continue
    const list = bySession.get(s8) ?? []
    list.push(p)
    bySession.set(s8, list)
  }
  const groups: DuplicateGroup[] = []
  for (const [session8, list] of bySession) {
    if (list.length > 1) {
      groups.push({ session8, paths: list, excess: list.length - 1 })
    }
  }
  groups.sort((a, b) => a.session8.localeCompare(b.session8))
  return groups
}

function basketOf(path: string, vaultRoot: string): 'distilled' | 'weak' | 'review' | 'other' {
  const n = normalizeDoctorPath(path)
  const root = normalizeDoctorPath(vaultRoot)
  const distilled = `${root}/distilled`
  if (n.includes('/_review/') || n.endsWith('/_review')) return 'review'
  if (n.includes('/_weak/') || n.endsWith('/_weak')) return 'weak'
  if (n === distilled || n.startsWith(`${distilled}/`)) return 'distilled'
  return 'other'
}

function extBucket(path: string): 'md' | 'epub' | 'pdf' | 'other' {
  const n = normalizeDoctorPath(path)
  if (n.endsWith('.md')) return 'md'
  if (n.endsWith('.epub')) return 'epub'
  if (n.endsWith('.pdf')) return 'pdf'
  return 'other'
}

function isLibraryLogicalPath(path: string, vaultRoot: string): boolean {
  const n = normalizeDoctorPath(path)
  const root = normalizeDoctorPath(vaultRoot)
  return n.startsWith(`${root}/library/`)
}

function isReviewPath(path: string): boolean {
  const n = normalizeDoctorPath(path)
  return n.includes('/_review/') || /\/_review$/i.test(n)
}

/**
 * Compare index vs disk. Paths are compared after {@link normalizeDoctorPath}
 * so `C:\Vault\a.md` and `C:/Vault/a.md` count as one.
 */
export function analyzeIndexConsistency(input: IndexConsistencyInput): IndexConsistencyResult {
  const fileExists = input.fileExists ?? ((p: string) => existsSync(p))
  const indexedKeys = new Map<string, string>()
  for (const p of input.indexedPaths) {
    indexedKeys.set(normalizeDoctorPath(p), p)
  }
  const diskKeys = new Map<string, string>()
  for (const p of input.diskIndexablePaths) {
    diskKeys.set(normalizeDoctorPath(p), p)
  }

  const deadEntries: string[] = []
  for (const [key, original] of indexedKeys) {
    if (isLibraryLogicalPath(original, input.vaultRoot)) continue
    // Alive if on disk under either separator form, or mirrored in the disk set.
    if (fileExists(original) || fileExists(key) || diskKeys.has(key)) continue
    deadEntries.push(original)
  }

  const missingFromIndex: string[] = []
  for (const [key, original] of diskKeys) {
    if (!indexedKeys.has(key)) missingFromIndex.push(original)
  }

  let reviewChunkCount = 0
  let reviewIndexedFiles = 0
  const reviewFileKeys = new Set<string>()
  const counts = input.chunkCounts
  let totalChunks = 0
  const countedKeys = new Set<string>()

  for (const p of input.chunkPaths) {
    const key = normalizeDoctorPath(p)
    const c = counts?.[p] ?? counts?.[key] ?? 1
    if (!countedKeys.has(key)) {
      countedKeys.add(key)
      totalChunks += c
    }
    if (isReviewPath(p)) {
      reviewChunkCount += counts?.[p] ?? counts?.[key] ?? c
      reviewFileKeys.add(key)
    }
  }

  // Also count indexed_files that point at _review even without chunks.
  for (const p of input.indexedPaths) {
    if (isReviewPath(p)) reviewFileKeys.add(normalizeDoctorPath(p))
  }
  reviewIndexedFiles = reviewFileKeys.size

  // If review chunks were double-added via path forms, clamp to sum of unique review keys.
  if (counts) {
    reviewChunkCount = 0
    for (const key of reviewFileKeys) {
      const original = input.chunkPaths.find((p) => normalizeDoctorPath(p) === key)
      if (!original) continue
      reviewChunkCount += counts[original] ?? counts[key] ?? 0
    }
  }

  const byExt = { md: 0, epub: 0, pdf: 0, other: 0 }
  const byBasket = { distilled: 0, weak: 0, review: 0, other: 0 }
  for (const p of input.indexedPaths) {
    byExt[extBucket(p)]++
    byBasket[basketOf(p, input.vaultRoot)]++
  }

  return {
    deadEntries,
    missingFromIndex,
    reviewChunkCount,
    reviewIndexedFiles,
    totalIndexedFiles: indexedKeys.size,
    totalChunks,
    byExt,
    byBasket,
  }
}

export function resolvePomniaUserData(override?: string): string {
  if (override) return override
  if (process.env.POMNIA_USER_DATA) return process.env.POMNIA_USER_DATA
  const os = currentOS()
  return join(appDataRoot(os, homeDir()), 'Pomnia')
}

export function defaultLibraryDbPath(userDataDir?: string): string {
  return join(resolvePomniaUserData(userDataDir), 'brain-core-data', 'vectordb', 'library.db')
}

export function defaultLedgerPath(userDataDir?: string): string {
  return join(resolvePomniaUserData(userDataDir), 'distill-ledger.json')
}

export function resolveVaultPath(explicit?: string, userDataDir?: string): string {
  if (explicit) return explicit
  if (process.env.POMNIA_VAULT) return process.env.POMNIA_VAULT
  const settingsPath = join(resolvePomniaUserData(userDataDir), 'app-settings.json')
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as { lastIndexedVaultRoot?: string }
    if (raw.lastIndexedVaultRoot && existsSync(raw.lastIndexedVaultRoot)) {
      return raw.lastIndexedVaultRoot
    }
  } catch {
    /* no settings */
  }
  const fallback = process.platform === 'win32' ? 'C:\\Vault' : join(homeDir(), 'Vault')
  return fallback
}

function humanBytes(bytes: number): string {
  const u = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function countMdInDir(dir: string, recursive = false): number {
  if (!existsSync(dir)) return 0
  let n = 0
  let ents
  try {
    ents = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const ent of ents) {
    if (ent.name.startsWith('.')) continue
    const full = join(dir, ent.name)
    if (ent.isDirectory()) {
      if (recursive) n += countMdInDir(full, true)
    } else if (ent.isFile() && ent.name.endsWith('.md')) n++
  }
  return n
}

function walkVaultStats(vaultPath: string): {
  fileCount: number
  totalBytes: number
  distilled: number
  weak: number
  review: number
  basketMdPaths: string[]
  indexablePaths: string[]
} {
  let fileCount = 0
  let totalBytes = 0
  const basketMdPaths: string[] = []
  const indexablePaths: string[] = []
  const distilledDir = join(vaultPath, 'distilled')

  const walk = (dir: string, depth: number): void => {
    let ents
    try {
      ents = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of ents) {
      if (ent.name.startsWith('.')) continue
      const full = join(dir, ent.name)
      if (ent.isDirectory()) {
        if (depth < 6) walk(full, depth + 1)
      } else if (ent.isFile()) {
        fileCount++
        try {
          totalBytes += statSync(full).size
        } catch {
          /* skip */
        }
      }
    }
  }
  if (existsSync(vaultPath)) walk(vaultPath, 0)

  const listBasket = (dir: string, indexable: boolean): void => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md') || name.startsWith('.')) continue
      const full = join(dir, name)
      try {
        if (!statSync(full).isFile()) continue
      } catch {
        continue
      }
      basketMdPaths.push(full)
      if (indexable) indexablePaths.push(full)
    }
  }
  listBasket(distilledDir, true)
  listBasket(join(distilledDir, '_weak'), true)
  listBasket(join(distilledDir, '_review'), false)

  return {
    fileCount,
    totalBytes,
    distilled: countMdInDir(distilledDir, false),
    weak: countMdInDir(join(distilledDir, '_weak'), false),
    review: countMdInDir(join(distilledDir, '_review'), false),
    basketMdPaths,
    indexablePaths,
  }
}

type SqlRows = { p: string; c?: number }[]

const require = createRequire(import.meta.url)

/** Open library.db read-only — prefer better-sqlite3 (Electron ABI), else node:sqlite (CLI). */
function readIndexRows(dbPath: string): { indexed: string[]; chunks: SqlRows } | null {
  // 1) better-sqlite3 — matches Electron-rebuilt native binary
  try {
    const Database = require('better-sqlite3') as new (
      path: string,
      opts?: { readonly?: boolean; fileMustExist?: boolean },
    ) => {
      prepare: (sql: string) => { all: () => unknown[] }
      close: () => void
    }
    const db = new Database(dbPath, { readonly: true, fileMustExist: true })
    try {
      const indexed = (db.prepare('SELECT pdf_path AS p FROM indexed_files').all() as { p: string }[]).map(
        (r) => r.p,
      )
      const chunks = db
        .prepare('SELECT pdf_path AS p, COUNT(*) AS c FROM chunks GROUP BY pdf_path')
        .all() as SqlRows
      return { indexed, chunks }
    } finally {
      db.close()
    }
  } catch {
    /* ABI mismatch or missing module — try built-in */
  }

  // 2) node:sqlite (Node 22.5+ / 24) — no native rebuild needed for CLI
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        path: string,
        opts?: { readOnly?: boolean },
      ) => {
        prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] }
        close: () => void
      }
    }
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const indexed = (db.prepare('SELECT pdf_path AS p FROM indexed_files').all() as { p: string }[]).map(
        (r) => r.p,
      )
      const chunks = db
        .prepare('SELECT pdf_path AS p, COUNT(*) AS c FROM chunks GROUP BY pdf_path')
        .all() as SqlRows
      return { indexed, chunks }
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

function readIndexFromDb(
  dbPath: string,
  vaultRoot: string,
): { input: IndexConsistencyInput } | { error: string } | null {
  if (!existsSync(dbPath)) return null
  const rows = readIndexRows(dbPath)
  if (!rows) {
    return {
      error:
        'could not open library.db (better-sqlite3 ABI mismatch and node:sqlite unavailable) — use Brain UI „Sprawdź stan” or rebuild native modules',
    }
  }
  const chunkPaths = rows.chunks.map((r) => r.p)
  const chunkCounts: Record<string, number> = {}
  for (const r of rows.chunks) {
    const n = Number(r.c ?? 1)
    chunkCounts[r.p] = n
    chunkCounts[normalizeDoctorPath(r.p)] = n
  }
  return {
    input: {
      indexedPaths: rows.indexed,
      chunkPaths,
      chunkCounts,
      diskIndexablePaths: [],
      vaultRoot,
    },
  }
}

function hasModel(models: string[], want: string): boolean {
  return models.some((m) => m === want || m === `${want}:latest` || m.replace(/:latest$/, '') === want)
}

export async function collectDistillQueue(
  ledgerPath: string,
): Promise<{ perSource: DistillSourceRow[]; ledgerProcessed: number }> {
  let processed: Record<string, string> = {}
  try {
    const raw = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as {
      processed?: Record<string, string>
    }
    processed = raw.processed ?? {}
  } catch {
    processed = {}
  }
  const os = currentOS()
  const home = homeDir()
  const perSource: DistillSourceRow[] = []
  for (const s of await detectAll()) {
    const a = getAdapter(s.id)
    if (!s.installed || !a?.collectConversations) continue
    const root = a.resolveRoot(os, home)
    if (!root) continue
    if (s.id === 'cursor' && (await isCursorDbTooLarge(root))) {
      const convs = await a.collectConversations(root)
      if (convs.length > 0) {
        const pending = convs.filter((c) => !processed[c.id]).length
        perSource.push({
          source: s.id,
          label: s.label,
          total: convs.length,
          processed: convs.length - pending,
          pending,
        })
      } else {
        perSource.push({
          source: s.id,
          label: s.label,
          total: s.conversations ?? 0,
          processed: 0,
          pending: null,
          uncountableHint: 'cursor-db-too-large',
        })
      }
      continue
    }
    const convs = await a.collectConversations(root)
    const pending = convs.filter((c) => !processed[c.id]).length
    perSource.push({
      source: s.id,
      label: s.label,
      total: convs.length,
      processed: convs.length - pending,
      pending,
    })
  }
  return { perSource, ledgerProcessed: Object.keys(processed).length }
}

function tally(checks: DoctorCheck[]): Pick<DoctorReport, 'ok' | 'warn' | 'fail' | 'exitCode'> {
  let ok = 0
  let warn = 0
  let fail = 0
  for (const c of checks) {
    if (c.level === 'OK') ok++
    else if (c.level === 'WARN') warn++
    else fail++
  }
  return { ok, warn, fail, exitCode: fail > 0 ? 1 : 0 }
}

/** One line per check: `OK …` / `WARN …` / `FAIL …` plus summary. */
export function formatDoctorLines(report: DoctorReport): string[] {
  const lines = report.checks.map((c) => {
    const action = c.action && c.level !== 'OK' ? ` — ${c.action}` : ''
    return `${c.level} ${c.message}${action}`
  })
  lines.push(`${report.ok} OK · ${report.warn} WARN · ${report.fail} FAIL`)
  return lines
}

export function formatDoctorText(report: DoctorReport): string {
  return formatDoctorLines(report).join('\n')
}

/**
 * Run full doctor suite. CLI and UI must call this (or format helpers on its result).
 */
export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const userData = resolvePomniaUserData(opts.userDataDir)
  const vaultPath = resolveVaultPath(opts.vaultPath, opts.userDataDir)
  const libraryDb = opts.libraryDbPath ?? defaultLibraryDbPath(opts.userDataDir)
  const ledgerPath = opts.ledgerPath ?? defaultLedgerPath(opts.userDataDir)
  const brainUrl = (opts.brainUrl || 'http://127.0.0.1:7862').replace(/\/+$/, '')
  const embedModel = opts.embedModel || PROFILE_EMBED_MODEL
  const distillModel =
    opts.distillModel ||
    VRAM_PROFILES.find((p) => p.id === 'standard')?.chatModel ||
    defaultOllamaConfig().chatModel

  // ── 1. Build identity ──────────────────────────────────────────────────
  const identity = formatBuildIdentity(
    BUILD_VERSION,
    BUILD_GIT_SHA,
    BUILD_TIMESTAMP,
    BUILD_DIRTY,
  )
  if (BUILD_DIRTY) {
    checks.push({
      id: 'build',
      level: 'FAIL',
      message: `build ${identity}`,
      action: 'clean working tree + npm run generate:build-info — dirty build unfit for judging health (BUILD_DIRTY)',
      data: {
        version: BUILD_VERSION,
        sha: BUILD_GIT_SHA,
        timestamp: BUILD_TIMESTAMP,
        dirty: true,
      },
    })
  } else {
    checks.push({
      id: 'build',
      level: 'OK',
      message: `build ${identity}`,
      data: {
        version: BUILD_VERSION,
        sha: BUILD_GIT_SHA,
        timestamp: BUILD_TIMESTAMP,
        dirty: false,
      },
    })
  }

  // ── 2. Vault ───────────────────────────────────────────────────────────
  const vaultExists = existsSync(vaultPath)
  const vaultOpen =
    opts.vaultOpen !== undefined ? opts.vaultOpen : vaultExists
  const stats = vaultExists
    ? walkVaultStats(vaultPath)
    : {
        fileCount: 0,
        totalBytes: 0,
        distilled: 0,
        weak: 0,
        review: 0,
        basketMdPaths: [] as string[],
        indexablePaths: [] as string[],
      }

  if (!vaultExists) {
    checks.push({
      id: 'vault',
      level: 'WARN',
      message: `vault missing at ${vaultPath}`,
      action: `open or create vault, or pass --vault <path> (default placeholder C:\\Vault)`,
      data: { path: vaultPath, open: false },
    })
  } else {
    checks.push({
      id: 'vault',
      level: 'OK',
      message: `vault ${vaultPath} · ${vaultOpen ? 'open' : 'closed'} · ${stats.fileCount} files · ${humanBytes(stats.totalBytes)} · distilled=${stats.distilled} _weak=${stats.weak} _review=${stats.review}`,
      data: {
        path: vaultPath,
        open: vaultOpen,
        fileCount: stats.fileCount,
        totalBytes: stats.totalBytes,
        distilled: stats.distilled,
        weak: stats.weak,
        review: stats.review,
      },
    })
  }

  // ── 3. Duplicate notes ─────────────────────────────────────────────────
  const basketPaths = opts.duplicateFixture ?? stats.basketMdPaths
  const dupes = findDuplicateSessionGroups(basketPaths)
  if (dupes.length === 0) {
    checks.push({
      id: 'duplicates',
      level: 'OK',
      message: 'duplicates none (unique session suffixes across baskets)',
    })
  } else {
    const excess = dupes.reduce((a, g) => a + g.excess, 0)
    checks.push({
      id: 'duplicates',
      level: 'WARN',
      message: `duplicates ${dupes.length} session(s) with >1 note (${excess} excess file(s))`,
      action: `node scripts/dedupe-vault-session-notes.mjs --dry-run --vault ${vaultPath}`,
      data: { groups: dupes.length, excess, sessions: dupes.map((d) => d.session8) },
    })
  }

  // ── 4. Index consistency ───────────────────────────────────────────────
  let indexInput = opts.indexFixture
  if (!indexInput && !opts.skipLive) {
    const fromDb = readIndexFromDb(libraryDb, vaultPath)
    if (fromDb && 'input' in fromDb) {
      fromDb.input.diskIndexablePaths = stats.indexablePaths
      indexInput = fromDb.input
    } else if (fromDb && 'error' in fromDb) {
      checks.push({
        id: 'index',
        level: 'WARN',
        message: `index ${fromDb.error}`,
        action: 'Brain → Sprawdź stan (UI uses Electron ABI) or: npm rebuild better-sqlite3',
        data: { libraryDbPath: libraryDb },
      })
    }
  }

  if (!indexInput && !checks.some((c) => c.id === 'index')) {
    checks.push({
      id: 'index',
      level: 'WARN',
      message: `index library.db missing at ${libraryDb}`,
      action: 'start embedded Brain and run reindex (Brain → Reindex)',
      data: { libraryDbPath: libraryDb },
    })
  } else if (indexInput) {
    const result = analyzeIndexConsistency(indexInput)
    const parts = [
      `files=${result.totalIndexedFiles}`,
      `chunks=${result.totalChunks}`,
      `md=${result.byExt.md} epub=${result.byExt.epub} pdf=${result.byExt.pdf}`,
      `baskets distilled=${result.byBasket.distilled} _weak=${result.byBasket.weak} _review=${result.byBasket.review}`,
    ]
    if (result.reviewChunkCount > 0 || result.reviewIndexedFiles > 0) {
      checks.push({
        id: 'index',
        level: 'FAIL',
        message: `index ${parts.join(' · ')} · _review chunks=${result.reviewChunkCount} files=${result.reviewIndexedFiles}`,
        action:
          'quarantine must NOT be indexed — remove _review paths from library.db then Brain → Reindex (or prune via reindex after deleting orphans)',
        data: { ...result, libraryDbPath: libraryDb },
      })
    } else if (result.deadEntries.length > 0 || result.missingFromIndex.length > 0) {
      checks.push({
        id: 'index',
        level: 'WARN',
        message: `index ${parts.join(' · ')} · dead=${result.deadEntries.length} missing=${result.missingFromIndex.length}`,
        action: 'Brain → Reindex (or pomnia brain pipeline / brainCore reindex) to sync library.db with vault',
        data: { ...result, libraryDbPath: libraryDb },
      })
    } else {
      checks.push({
        id: 'index',
        level: 'OK',
        message: `index ${parts.join(' · ')} · dead=0 missing=0`,
        data: { ...result, libraryDbPath: libraryDb },
      })
    }
  }

  // ── 5. Distill queue ───────────────────────────────────────────────────
  if (opts.skipLive) {
    checks.push({
      id: 'distill',
      level: 'OK',
      message: 'distill queue skipped (skipLive)',
    })
  } else {
    try {
      const { perSource } = await collectDistillQueue(ledgerPath)
      if (perSource.length === 0) {
        checks.push({
          id: 'distill',
          level: 'OK',
          message: 'distill queue no installed sources detected',
          data: { ledgerPath, perSource: [] },
        })
      } else {
        const bits = perSource.map((p) => {
          if (p.pending == null) {
            return `${p.source}: total=${p.total} processed=— pending=— (DB > 256 MB)`
          }
          return `${p.source}: total=${p.total} processed=${p.processed} pending=${p.pending}`
        })
        const anyUncountable = perSource.some((p) => p.pending == null)
        checks.push({
          id: 'distill',
          level: anyUncountable ? 'WARN' : 'OK',
          message: `distill ${bits.join(' · ')}`,
          action: anyUncountable
            ? 'Cursor state.vscdb > 256 MB — pending shown as —; shrink DB or rely on agent-transcripts'
            : undefined,
          data: { ledgerPath, perSource },
        })
      }
    } catch (e) {
      checks.push({
        id: 'distill',
        level: 'WARN',
        message: `distill queue unreadable: ${(e as Error).message}`,
        action: `check ${ledgerPath}`,
      })
    }
  }

  // ── 6. Ollama ──────────────────────────────────────────────────────────
  if (opts.skipLive) {
    checks.push({
      id: 'ollama',
      level: 'OK',
      message: 'ollama skipped (skipLive)',
    })
  } else {
    const cfg = defaultOllamaConfig()
    if (opts.ollamaUrl) cfg.baseUrl = opts.ollamaUrl
    cfg.embedModel = embedModel
    cfg.chatModel = distillModel
    const ollama = new Ollama(cfg)
    const reachable = await ollama.reachable()
    if (!reachable) {
      checks.push({
        id: 'ollama',
        level: 'FAIL',
        message: `ollama unreachable at ${cfg.baseUrl}`,
        action: 'start Ollama (https://ollama.com) then: ollama pull nomic-embed-text',
        data: { baseUrl: cfg.baseUrl },
      })
    } else {
      const models = (await ollama.listModels()).map((m) => m.name)
      const embedOk = hasModel(models, embedModel)
      const chatOk = hasModel(models, distillModel)
      if (!embedOk) {
        checks.push({
          id: 'ollama',
          level: 'FAIL',
          message: `ollama reachable · missing embed model ${embedModel}`,
          action: `ollama pull ${embedModel}`,
          data: { baseUrl: cfg.baseUrl, models, embedModel, distillModel },
        })
      } else if (!chatOk) {
        checks.push({
          id: 'ollama',
          level: 'WARN',
          message: `ollama OK embed=${embedModel} · missing distill model ${distillModel}`,
          action: `ollama pull ${distillModel} (search still works without it)`,
          data: { baseUrl: cfg.baseUrl, models, embedModel, distillModel },
        })
      } else {
        checks.push({
          id: 'ollama',
          level: 'OK',
          message: `ollama ${cfg.baseUrl} · embed=${embedModel} · distill=${distillModel}`,
          data: { baseUrl: cfg.baseUrl, embedModel, distillModel },
        })
      }
    }
  }

  // ── 7. Brain /healthz ──────────────────────────────────────────────────
  if (opts.skipLive) {
    checks.push({
      id: 'brain',
      level: 'OK',
      message: 'brain skipped (skipLive)',
    })
  } else {
    const ping = await pingBrain(brainUrl)
    const okHealthz =
      ping.reachable &&
      (ping.url.includes('/healthz') ||
        (ping.data && ping.data.ok === true && ping.data.service === 'brain-core'))
    if (okHealthz || (ping.reachable && ping.status === 200)) {
      // Prefer explicit healthz semantics when available.
      const serviceOk =
        !ping.data ||
        ping.data.service === undefined ||
        ping.data.service === 'brain-core'
      if (ping.reachable && serviceOk) {
        checks.push({
          id: 'brain',
          level: 'OK',
          message: `brain ${brainUrl}/healthz responding`,
          data: { url: ping.url, status: ping.status },
        })
      } else {
        checks.push({
          id: 'brain',
          level: 'FAIL',
          message: `brain ${brainUrl} unexpected /healthz payload`,
          action: 'Brain page → start embedded Brain (127.0.0.1:7862)',
          data: { url: ping.url, data: ping.data },
        })
      }
    } else {
      checks.push({
        id: 'brain',
        level: 'FAIL',
        message: `brain not listening on ${brainUrl} (/healthz)`,
        action: 'Brain page → start embedded Brain, or: ensure port 7862 is free',
        data: { error: ping.error, status: ping.status },
      })
    }
  }

  const summary = tally(checks)
  return {
    checks,
    ...summary,
    generatedAt: new Date().toISOString(),
  }
}
