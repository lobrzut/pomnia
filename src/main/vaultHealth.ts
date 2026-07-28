// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Vault ↔ index health check on every vault open / Brain start.
 *
 * Catches the server→local footgun: vault folder looks familiar but library.db
 * is empty/tiny (or the opposite: rich index, thin portable vault).
 *
 * Does NOT load 200MB library.db into sql.js — uses sidecar stats JSON and/or
 * file-size heuristics; refreshes counts when Brain is running.
 */

import { existsSync, readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brainCoreDataDir, brainVaultRoot } from './brainPaths.js'
import { getAppSettings, setAppSettings } from './appSettings.js'
import { log } from '@core/log.js'

export type VaultHealthLevel = 'ok' | 'info' | 'warn' | 'critical'

export interface VaultHealthReport {
  level: VaultHealthLevel
  code:
    | 'ok'
    | 'empty_index'
    | 'thin_index'
    | 'vault_changed'
    | 'thin_vault_rich_index'
    | 'no_vault'
    | 'no_index_file'
  titlePl: string
  titleEn: string
  detailPl: string
  detailEn: string
  /** Suggested UI action */
  action?: 'reindex' | 'start_brain' | 'distill' | 'none'
  vaultRoot: string | null
  distilledNotes: number
  sessionNotes: number
  indexFiles: number | null
  indexChunks: number | null
  indexDbBytes: number | null
  fingerprint: string
  changedSinceLast: boolean
}

export interface LibraryStatsSidecar {
  files: number
  chunks: number
  updatedAt: string
  vaultRoot?: string
}

/** Absolute floor for the classic empty library.db footgun (~155 chunks). */
const EMPTY_INDEX_CHUNKS = 500
/** Rich index threshold for thin-vault info (PDF/EPUB installs). */
const RICH_INDEX_CHUNKS = 10_000
/** Below this many vault notes, "thin vault" vs rich index is informative. */
const THIN_VAULT_NOTES = 250
/**
 * Warn when chunks/file falls below this — missing embeddings for some files.
 * Short notes often land at ~1 chunk; multi-chunk docs push the ratio above 1.
 */
export const MIN_CHUNKS_PER_FILE = 0.8

/**
 * Keep in sync with packages/brain-core/src/rag/indexer.ts INDEX_SUBDIRS /
 * SKIP_DIRS / TEXT_EXTS — health denominator must match what reindex walks.
 */
export const INDEX_SUBDIRS = ['distilled', 'sessions', 'library'] as const
const SKIP_DIRS = new Set([
  '_review',
  '_quarantine_stubs',
  'skills',
  'blobs',
  'snapshots',
  'node_modules',
  '.git',
])
const TEXT_EXTS = new Set(['.md', '.txt', '.markdown'])

export interface VaultIndexableCounts {
  distilled: number
  sessions: number
  library: number
  total: number
  newestMs: number
  /** True when vault/library/ has any file (PDF/EPUB installs) — gates server copy language. */
  libraryHasContent: boolean
}

/** Recursively count indexable text files under `dir` (respects SKIP_DIRS). */
export function countIndexableTextFiles(dir: string): { count: number; newestMs: number } {
  let count = 0
  let newestMs = 0
  if (!existsSync(dir)) return { count, newestMs }

  const walk = (d: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      if (SKIP_DIRS.has(name)) continue
      const p = join(d, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        walk(p)
        continue
      }
      const ext = extname(name).toLowerCase()
      if (!TEXT_EXTS.has(ext)) continue
      if (name.toLowerCase().includes('.bak')) continue
      count++
      if (st.mtimeMs > newestMs) newestMs = st.mtimeMs
    }
  }
  walk(dir)
  return { count, newestMs }
}

/** Any non-dir file under library/ (sources, parsed text, binaries). */
function libraryTreeHasContent(libraryDir: string): boolean {
  if (!existsSync(libraryDir)) return false
  const walk = (d: string): boolean => {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return false
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      if (SKIP_DIRS.has(name)) continue
      const p = join(d, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (walk(p)) return true
      } else {
        return true
      }
    }
    return false
  }
  return walk(libraryDir)
}

/**
 * Note/file counts for health checks — same trees the indexer walks when
 * INDEX_SUBDIRS are present (incl. distilled/_weak, sessions/checkpoints).
 */
export function countVaultIndexableNotes(vaultRoot: string): VaultIndexableCounts {
  const distilled = countIndexableTextFiles(join(vaultRoot, 'distilled'))
  const sessions = countIndexableTextFiles(join(vaultRoot, 'sessions'))
  const libraryDir = join(vaultRoot, 'library')
  const library = countIndexableTextFiles(libraryDir)
  const libraryHasContent = libraryTreeHasContent(libraryDir)
  return {
    distilled: distilled.count,
    sessions: sessions.count,
    library: library.count,
    total: distilled.count + sessions.count + library.count,
    newestMs: Math.max(distilled.newestMs, sessions.newestMs, library.newestMs),
    libraryHasContent,
  }
}

export function libraryStatsPath(): string {
  return join(brainCoreDataDir(), 'vectordb', 'library-stats.json')
}

export function libraryDbPath(): string {
  return join(brainCoreDataDir(), 'vectordb', 'library.db')
}

export function readLibraryStatsSidecar(): LibraryStatsSidecar | null {
  const p = libraryStatsPath()
  if (!existsSync(p)) return null
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as LibraryStatsSidecar
    if (typeof j.files !== 'number' || typeof j.chunks !== 'number') return null
    return j
  } catch {
    return null
  }
}

export function writeLibraryStatsSidecar(stats: {
  files: number
  chunks: number
  vaultRoot?: string
}): void {
  const dir = join(brainCoreDataDir(), 'vectordb')
  try {
    mkdirSync(dir, { recursive: true })
    const payload: LibraryStatsSidecar = {
      files: stats.files,
      chunks: stats.chunks,
      updatedAt: new Date().toISOString(),
      vaultRoot: stats.vaultRoot,
    }
    writeFileSync(libraryStatsPath(), JSON.stringify(payload, null, 2), 'utf8')
  } catch (e) {
    log.warn('library-stats write failed:', (e as Error).message)
  }
}

function fingerprintOf(opts: {
  vaultRoot: string
  distilled: number
  sessions: number
  newestMs: number
  chunks: number | null
}): string {
  return [
    opts.vaultRoot,
    opts.distilled,
    opts.sessions,
    Math.floor(opts.newestMs / 60_000),
    opts.chunks ?? 'na',
  ].join('|')
}

function serverCopyHint(libraryHasContent: boolean): { pl: string; en: string } {
  if (!libraryHasContent) {
    return { pl: '', en: '' }
  }
  return {
    pl: ' Serwer mógł mieć dziesiątki tysięcy chunków z PDF/EPUB w library/ — rozważ pełny reindex / kopię library.db.',
    en: ' A server install may have tens of thousands of chunks from PDF/EPUB under library/ — full reindex or library.db copy may help.',
  }
}

export interface VaultHealthAssessInput {
  vaultRoot: string
  distilled: number
  sessions: number
  /** Indexable text files under library/ (usually 0 when PDFs are logical paths). */
  libraryText?: number
  libraryHasContent: boolean
  newestMs?: number
  indexFiles: number | null
  indexChunks: number | null
  indexDbBytes: number | null
  dbExists: boolean
  lastFingerprint?: string | null
}

/**
 * Pure health decision from counts — testable without Electron / large fixtures.
 * Denominator = distilled + sessions + library text (INDEX_SUBDIRS walk).
 */
export function assessVaultHealthCounts(input: VaultHealthAssessInput): VaultHealthReport {
  const vaultNotes = input.distilled + input.sessions + (input.libraryText ?? 0)
  const newestMs = input.newestMs ?? 0
  const { libraryHasContent, vaultRoot } = input
  let { indexFiles, indexChunks, indexDbBytes } = input

  // Heuristic when no sidecar yet: tiny db ≈ empty index (the 155-chunk footgun).
  if (indexChunks == null && indexDbBytes != null) {
    if (indexDbBytes < 2_000_000) indexChunks = 0
    else if (indexDbBytes > 50_000_000) indexChunks = RICH_INDEX_CHUNKS // "at least rich"
  }

  const fp = fingerprintOf({
    vaultRoot,
    distilled: input.distilled,
    sessions: input.sessions,
    newestMs,
    chunks: indexChunks,
  })
  const changedSinceLast = Boolean(input.lastFingerprint && input.lastFingerprint !== fp)
  const chunksPerFile =
    indexChunks != null && vaultNotes > 0 ? indexChunks / vaultNotes : null

  if (!input.dbExists) {
    const hint = serverCopyHint(libraryHasContent)
    return {
      level: 'critical',
      code: 'no_index_file',
      titlePl: 'Brak library.db',
      titleEn: 'Missing library.db',
      detailPl: `Vault ma ${vaultNotes} notatek, ale nie ma lokalnego indeksu. Uruchom wyszukiwarkę i Odśwież indeks.${hint.pl}`,
      detailEn: `Vault has ${vaultNotes} notes but no local index. Start searcher and Refresh index.${hint.en}`,
      action: 'start_brain',
      vaultRoot,
      distilledNotes: input.distilled,
      sessionNotes: input.sessions,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  // Tiny absolute + bad density = classic empty library.db footgun (not a healthy small vault).
  if (
    indexChunks != null &&
    chunksPerFile != null &&
    indexChunks < EMPTY_INDEX_CHUNKS &&
    vaultNotes > 20 &&
    chunksPerFile < MIN_CHUNKS_PER_FILE
  ) {
    const hint = serverCopyHint(libraryHasContent)
    return {
      level: 'critical',
      code: 'empty_index',
      titlePl: 'Pusty / mikroskopijny indeks',
      titleEn: 'Empty / tiny index',
      detailPl: `Indeks ma ~${indexChunks} chunków, a w vaultcie widać ${vaultNotes} notatek (~${chunksPerFile.toFixed(2)} chunk/plik). Agenci szukają w pustce — jak przy migracji serwer→local. Nie ufaj „Połączony”. Odśwież indeks.${hint.pl}`,
      detailEn: `Index has ~${indexChunks} chunks vs ${vaultNotes} vault notes (~${chunksPerFile.toFixed(2)} chunks/file). Agents search an empty brain — classic server→local footgun. Refresh index.${hint.en}`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: input.distilled,
      sessionNotes: input.sessions,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  // Incomplete: files missing chunks (ratio), not absolute chunk count vs another install.
  if (
    chunksPerFile != null &&
    vaultNotes > 20 &&
    chunksPerFile < MIN_CHUNKS_PER_FILE
  ) {
    const ratio = chunksPerFile.toFixed(2)
    const hint = serverCopyHint(libraryHasContent)
    return {
      level: 'warn',
      code: 'thin_index',
      titlePl: 'Indeks wygląda na niekompletny',
      titleEn: 'Index looks incomplete',
      detailPl: `~${indexChunks} chunków dla ${vaultNotes} notatek (~${ratio} chunk/plik; oczekiwane ≥${MIN_CHUNKS_PER_FILE}). Część plików może nie mieć embeddingów — Odśwież indeks.${hint.pl}`,
      detailEn: `~${indexChunks} chunks for ${vaultNotes} notes (~${ratio} chunks/file; expect ≥${MIN_CHUNKS_PER_FILE}). Some files may lack embeddings — Refresh index.${hint.en}`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: input.distilled,
      sessionNotes: input.sessions,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  if (
    indexChunks != null &&
    indexChunks >= RICH_INDEX_CHUNKS &&
    vaultNotes > 0 &&
    vaultNotes < THIN_VAULT_NOTES
  ) {
    return {
      level: 'info',
      code: 'thin_vault_rich_index',
      titlePl: 'Bogaty indeks, chudy folder vault',
      titleEn: 'Rich index, thin vault folder',
      detailPl: `Indeks ma ~${indexChunks} chunków (OK dla agentów), ale w ${vaultRoot} jest tylko ${vaultNotes} plików .md. Szukanie działa z indeksu; nowe distill trafiają tu. Nie rób reindex samego tego folderu, jeśli skasuje ścieżki z pełnej pamięci — najpierw zsynchronizuj distilled z serwera.`,
      detailEn: `Index has ~${indexChunks} chunks (agents OK) but only ${vaultNotes} .md under ${vaultRoot}. Search uses the index; new distill writes here. Don't reindex-only this folder if it would prune the full memory — sync distilled from server first.`,
      action: 'none',
      vaultRoot,
      distilledNotes: input.distilled,
      sessionNotes: input.sessions,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  if (changedSinceLast) {
    return {
      level: 'info',
      code: 'vault_changed',
      titlePl: 'Vault się zmienił od ostatniego sprawdzenia',
      titleEn: 'Vault changed since last check',
      detailPl: `Notatki: distilled ${input.distilled}, sessions ${input.sessions}; indeks ~${indexChunks ?? '?'} chunków. Jeśli dodałeś sesje — Odśwież indeks.`,
      detailEn: `Notes: distilled ${input.distilled}, sessions ${input.sessions}; index ~${indexChunks ?? '?'} chunks. If you added sessions — Refresh index.`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: input.distilled,
      sessionNotes: input.sessions,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  return {
    level: 'ok',
    code: 'ok',
    titlePl: 'Vault i indeks wyglądają spójnie',
    titleEn: 'Vault and index look healthy',
    detailPl: `${vaultNotes} notatek w vaultcie · ~${indexChunks ?? '?'} chunków w indeksie`,
    detailEn: `${vaultNotes} vault notes · ~${indexChunks ?? '?'} index chunks`,
    action: 'none',
    vaultRoot,
    distilledNotes: input.distilled,
    sessionNotes: input.sessions,
    indexFiles,
    indexChunks,
    indexDbBytes,
    fingerprint: fp,
    changedSinceLast: false,
  }
}

/**
 * Assess vault plaintext vs local library.db health.
 * Pass liveStats when Brain just reported library_status / reindex.
 */
export function assessVaultHealth(
  encryptedVaultPath: string | null | undefined,
  liveStats?: { files: number; chunks: number } | null,
): VaultHealthReport {
  const vaultRoot = encryptedVaultPath ? brainVaultRoot(encryptedVaultPath) : null
  if (!vaultRoot) {
    return {
      level: 'warn',
      code: 'no_vault',
      titlePl: 'Brak otwartego vaultu',
      titleEn: 'No vault open',
      detailPl: 'Otwórz vault (C:\\Vault), żeby Pomnia wiedziała, gdzie jest pamięć.',
      detailEn: 'Open your vault so Pomnia knows where memory lives.',
      action: 'none',
      vaultRoot: null,
      distilledNotes: 0,
      sessionNotes: 0,
      indexFiles: null,
      indexChunks: null,
      indexDbBytes: null,
      fingerprint: 'no-vault',
      changedSinceLast: false,
    }
  }

  const notes = countVaultIndexableNotes(vaultRoot)
  const dbPath = libraryDbPath()
  let indexDbBytes: number | null = null
  if (existsSync(dbPath)) {
    try {
      indexDbBytes = statSync(dbPath).size
    } catch {
      indexDbBytes = null
    }
  }

  const sidecar = readLibraryStatsSidecar()
  const indexFiles = liveStats?.files ?? sidecar?.files ?? null
  const indexChunks = liveStats?.chunks ?? sidecar?.chunks ?? null

  return assessVaultHealthCounts({
    vaultRoot,
    distilled: notes.distilled,
    sessions: notes.sessions,
    libraryText: notes.library,
    libraryHasContent: notes.libraryHasContent,
    newestMs: notes.newestMs,
    indexFiles,
    indexChunks,
    indexDbBytes,
    dbExists: existsSync(dbPath),
    lastFingerprint: getAppSettings().vaultHealthFingerprint,
  })
}

export async function persistVaultHealthFingerprint(report: VaultHealthReport): Promise<void> {
  try {
    await setAppSettings({ vaultHealthFingerprint: report.fingerprint })
  } catch (e) {
    log.warn('vault health fingerprint save failed:', (e as Error).message)
  }
}
