import { promises as fs } from 'node:fs'
import path from 'node:path'
import { log } from '../log.js'

const MAX_VSCDB_BYTES = 256 * 1024 * 1024

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.round(n / 1024)} KB`
}

/** Lazy-load sql.js (WASM). Returns null if unavailable. */
export async function loadSql(): Promise<any | null> {
  try {
    const mod: any = await import('sql.js')
    const initSqlJs = mod.default ?? mod
    const { createRequire } = await import('node:module')
    const require = createRequire(import.meta.url)
    require.resolve('sql.js/dist/sql-wasm.wasm')
    return await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
  } catch (e) {
    log.warn('sql.js unavailable — vscdb extraction skipped:', (e as Error).message)
    return null
  }
}

export function vscdbPath(appRoot: string, userSubdir = 'User'): string {
  return path.join(appRoot, userSubdir, 'globalStorage', 'state.vscdb')
}

export async function openVscdb(dbPath: string): Promise<any | null> {
  try {
    const st = await fs.stat(dbPath)
    if (st.size > MAX_VSCDB_BYTES) {
      log.warn(`vscdb too large (${fmtBytes(st.size)}) — skip: ${dbPath}`)
      return null
    }
  } catch {
    return null
  }
  const SQL = await loadSql()
  if (!SQL) return null
  try {
    return new SQL.Database(await fs.readFile(dbPath))
  } catch (e) {
    log.warn('could not open vscdb:', (e as Error).message)
    return null
  }
}

export async function queryItemTable(dbPath: string, where = '1=1'): Promise<Array<{ key: string; value: string }>> {
  const db = await openVscdb(dbPath)
  if (!db) return []
  try {
    const res = db.exec(`SELECT key, value FROM ItemTable WHERE ${where}`)
    if (!res.length) return []
    return res[0].values.map((row: any[]) => ({ key: String(row[0]), value: String(row[1]) }))
  } catch {
    return []
  } finally {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
}

export async function queryDiskKV(
  dbPath: string,
  where = '1=1'
): Promise<Array<{ key: string; value: string }>> {
  const db = await openVscdb(dbPath)
  if (!db) return []
  try {
    const res = db.exec(`SELECT key, value FROM cursorDiskKV WHERE ${where}`)
    if (!res.length) return []
    return res[0].values.map((row: any[]) => ({ key: String(row[0]), value: String(row[1]) }))
  } catch {
    return []
  } finally {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
}
