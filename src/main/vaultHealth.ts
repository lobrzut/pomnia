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
import { join } from 'node:path'
import { brainCoreDataDir, brainVaultDistilledDir, brainVaultRoot } from './brainPaths.js'
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

const EMPTY_INDEX_CHUNKS = 500
const THIN_INDEX_CHUNKS = 5_000
const RICH_INDEX_CHUNKS = 10_000
/** Below this many vault notes, "thin vault" vs rich index is informative. */
const THIN_VAULT_NOTES = 250

function countMdInDir(dir: string): { count: number; newestMs: number } {
  let count = 0
  let newestMs = 0
  if (!existsSync(dir)) return { count, newestMs }
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md') || name.includes('.bak')) continue
      count++
      try {
        const st = statSync(join(dir, name))
        if (st.mtimeMs > newestMs) newestMs = st.mtimeMs
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return { count, newestMs }
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

  const distilledDir = brainVaultDistilledDir(encryptedVaultPath)
  const sessionsDir = join(vaultRoot, 'sessions')
  const d = countMdInDir(distilledDir)
  const s = countMdInDir(sessionsDir)
  const vaultNotes = d.count + s.count
  const newestMs = Math.max(d.newestMs, s.newestMs)

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
  let indexFiles = liveStats?.files ?? sidecar?.files ?? null
  let indexChunks = liveStats?.chunks ?? sidecar?.chunks ?? null

  // Heuristic when no sidecar yet: tiny db ≈ empty index (the 155-chunk footgun).
  if (indexChunks == null && indexDbBytes != null) {
    if (indexDbBytes < 2_000_000) indexChunks = 0
    else if (indexDbBytes > 50_000_000) indexChunks = RICH_INDEX_CHUNKS // "at least rich"
  }

  const fp = fingerprintOf({
    vaultRoot,
    distilled: d.count,
    sessions: s.count,
    newestMs,
    chunks: indexChunks,
  })
  const lastFp = getAppSettings().vaultHealthFingerprint
  const changedSinceLast = Boolean(lastFp && lastFp !== fp)

  if (!existsSync(dbPath)) {
    return {
      level: 'critical',
      code: 'no_index_file',
      titlePl: 'Brak library.db',
      titleEn: 'Missing library.db',
      detailPl: `Vault ma ${vaultNotes} notatek, ale nie ma lokalnego indeksu. Uruchom wyszukiwarkę i Odśwież indeks (albo wgraj indeks z serwera).`,
      detailEn: `Vault has ${vaultNotes} notes but no local index. Start searcher and Refresh index (or restore server library.db).`,
      action: 'start_brain',
      vaultRoot,
      distilledNotes: d.count,
      sessionNotes: s.count,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  if (indexChunks != null && indexChunks < EMPTY_INDEX_CHUNKS && vaultNotes > 20) {
    return {
      level: 'critical',
      code: 'empty_index',
      titlePl: 'Pusty / mikroskopijny indeks',
      titleEn: 'Empty / tiny index',
      detailPl: `Indeks ma ~${indexChunks} chunków, a w vaultcie widać ${vaultNotes} notatek. Agenci szukają w pustce — jak przy migracji serwer→local. Nie ufaj „Połączony”. Odśwież indeks albo przywróć pełny library.db z serwera.`,
      detailEn: `Index has ~${indexChunks} chunks vs ${vaultNotes} vault notes. Agents search an empty brain — classic server→local footgun. Refresh index or restore full library.db.`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: d.count,
      sessionNotes: s.count,
      indexFiles,
      indexChunks,
      indexDbBytes,
      fingerprint: fp,
      changedSinceLast,
    }
  }

  if (indexChunks != null && indexChunks < THIN_INDEX_CHUNKS && vaultNotes > 100) {
    return {
      level: 'warn',
      code: 'thin_index',
      titlePl: 'Indeks wygląda na niekompletny',
      titleEn: 'Index looks incomplete',
      detailPl: `~${indexChunks} chunków przy ${vaultNotes} notatkach w vaultcie. Serwer miał dziesiątki tysięcy — rozważ pełny reindex / kopię library.db.`,
      detailEn: `~${indexChunks} chunks with ${vaultNotes} vault notes. Server had tens of thousands — full reindex or library.db copy recommended.`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: d.count,
      sessionNotes: s.count,
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
      distilledNotes: d.count,
      sessionNotes: s.count,
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
      detailPl: `Notatki: distilled ${d.count}, sessions ${s.count}; indeks ~${indexChunks ?? '?'} chunków. Jeśli dodałeś sesje — Odśwież indeks.`,
      detailEn: `Notes: distilled ${d.count}, sessions ${s.count}; index ~${indexChunks ?? '?'} chunks. If you added sessions — Refresh index.`,
      action: 'reindex',
      vaultRoot,
      distilledNotes: d.count,
      sessionNotes: s.count,
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
    distilledNotes: d.count,
    sessionNotes: s.count,
    indexFiles,
    indexChunks,
    indexDbBytes,
    fingerprint: fp,
    changedSinceLast: false,
  }
}

export async function persistVaultHealthFingerprint(report: VaultHealthReport): Promise<void> {
  try {
    await setAppSettings({ vaultHealthFingerprint: report.fingerprint })
  } catch (e) {
    log.warn('vault health fingerprint save failed:', (e as Error).message)
  }
}
