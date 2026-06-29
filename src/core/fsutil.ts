import { promises as fs } from 'node:fs'
import path from 'node:path'
import { toPortable } from './platform.js'

export interface WalkedFile {
  /** Forward-slash path relative to root. */
  relPath: string
  /** Native absolute path. */
  abs: string
  bytes: number
  mtime: string
}

export interface WalkOptions {
  /** Directory/file basenames to skip entirely. */
  exclude?: string[]
  /** If set, only keep entries whose first relative segment is in this list. */
  keepTop?: string[]
  /** Skip files larger than this (bytes). */
  maxFileBytes?: number
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function dirSize(root: string, opts: WalkOptions = {}): Promise<number> {
  let total = 0
  for await (const f of walk(root, opts)) total += f.bytes
  return total
}

/** Async generator that yields every file under root honoring excludes/keepTop. */
export async function* walk(root: string, opts: WalkOptions = {}): AsyncGenerator<WalkedFile> {
  const exclude = new Set(opts.exclude ?? [])
  const keepTop = opts.keepTop ? new Set(opts.keepTop) : null

  async function* recurse(dir: string): AsyncGenerator<WalkedFile> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (exclude.has(e.name)) continue
      const abs = path.join(dir, e.name)
      const rel = toPortable(path.relative(root, abs))
      if (keepTop) {
        const top = rel.split('/')[0]
        if (!keepTop.has(top)) continue
      }
      if (e.isDirectory()) {
        yield* recurse(abs)
      } else if (e.isFile()) {
        let st: import('node:fs').Stats
        try {
          st = await fs.stat(abs)
        } catch {
          continue
        }
        if (opts.maxFileBytes && st.size > opts.maxFileBytes) continue
        yield { relPath: rel, abs, bytes: st.size, mtime: st.mtime.toISOString() }
      }
    }
  }
  if (await pathExists(root)) yield* recurse(root)
}

export async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(file, 'utf8')
    return JSON.parse(txt) as T
  } catch {
    return null
  }
}

export async function countFilesMatching(root: string, pattern: RegExp, opts: WalkOptions = {}): Promise<number> {
  let n = 0
  for await (const f of walk(root, opts)) if (pattern.test(f.relPath)) n++
  return n
}
