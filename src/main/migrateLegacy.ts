/**
 * One-time migration from Reliqua-era paths (appData, brain index file).
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

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
    for (const name of await fs.readdir(oldDir)) {
      const src = join(oldDir, name)
      const dest = join(newDir, name)
      if (!(await pathExists(dest))) await fs.rename(src, dest).catch(() => {})
    }
  }
}

/** Rename .reliqua-index.json → .pomnia-index.json when upgrading. */
export async function migrateBrainIndexFile(brainNotesDir: string): Promise<void> {
  const newPath = join(brainNotesDir, '.pomnia-index.json')
  const oldPath = join(brainNotesDir, '.reliqua-index.json')
  if (await pathExists(newPath)) return
  if (await pathExists(oldPath)) await fs.rename(oldPath, newPath).catch(() => {})
}
