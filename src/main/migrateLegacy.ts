// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * One-time migration from Reliqua-era paths (appData, brain index file).
 *
 * These two functions decide whether a returning user keeps their settings and
 * their vault pointer or comes back to what looks like a fresh install. Both
 * used to end in `.catch(() => {})`: a locked or permission-denied file on
 * Windows produced no log line, no toast, and no trace — the app simply started
 * empty and the old state sat in a directory nobody would think to look in.
 * Failing is still not fatal here, but it must be visible.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import { log } from '@core/log.js'

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Copy missing files from %AppData%/Reliqua|reliqua into the new Pomnia userData dir. */
export async function migrateLegacyAppData(): Promise<void> {
  const newDir = app.getPath('userData')
  const legacyDirs = [join(app.getPath('appData'), 'Reliqua'), join(app.getPath('appData'), 'reliqua')]
  for (const oldDir of legacyDirs) {
    if (oldDir === newDir || !(await pathExists(oldDir))) continue
    await fs.mkdir(newDir, { recursive: true })
    let moved = 0
    const failed: string[] = []
    for (const name of await fs.readdir(oldDir)) {
      const src = join(oldDir, name)
      const dest = join(newDir, name)
      if (await pathExists(dest)) continue
      try {
        await fs.rename(src, dest)
        moved++
      } catch (e) {
        failed.push(`${name} (${(e as Error).message})`)
      }
    }
    if (moved) log.info(`legacy appData: moved ${moved} item(s) from ${oldDir}`)
    if (failed.length) {
      // Named individually: which file stayed behind is the whole question when
      // a user reports that their vault or token "disappeared" after upgrading.
      log.warn(`legacy appData: ${failed.length} item(s) left in ${oldDir} — ${failed.join(', ')}`)
    }
  }
}

/** Rename .reliqua-index.json → .pomnia-index.json when upgrading. */
export async function migrateBrainIndexFile(brainNotesDir: string): Promise<void> {
  const newPath = join(brainNotesDir, '.pomnia-index.json')
  const oldPath = join(brainNotesDir, '.reliqua-index.json')
  if (await pathExists(newPath)) return
  if (!(await pathExists(oldPath))) return
  try {
    await fs.rename(oldPath, newPath)
    log.info('legacy brain index renamed to .pomnia-index.json')
  } catch (e) {
    // Survivable — the index rebuilds — but a rebuild is minutes of embedding
    // the user did not ask for, so say why it is about to happen.
    log.warn(`legacy brain index rename failed: ${(e as Error).message} — index will be rebuilt`)
  }
}
