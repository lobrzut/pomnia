// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Write distilled notes into vault/distilled with quality baskets. */

import { promises as fs } from 'node:fs'
import { join, basename } from 'node:path'

import { noteFilename, sessionIdFileSuffix } from './note.js'
import { destinationForQuality } from './quality.js'
import type { DistilledNote, QualityDestination } from './types.js'

function destDir(distilledRoot: string, dest: QualityDestination): string {
  if (dest === 'review') return join(distilledRoot, '_review')
  if (dest === 'weak') return join(distilledRoot, '_weak')
  return distilledRoot
}

function basketDirs(targetDir: string): string[] {
  return [targetDir, join(targetDir, '_weak'), join(targetDir, '_review')]
}

export async function removePriorSessionNotes(
  targetDir: string,
  sessionId: string,
): Promise<string[]> {
  const removed: string[] = []
  const suffix = `_${sessionIdFileSuffix(sessionId)}.md`
  for (const dir of basketDirs(targetDir)) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith(suffix)) continue
      const file = join(dir, name)
      try {
        await fs.unlink(file)
        removed.push(file)
      } catch {
        /* raced */
      }
    }
  }
  return removed
}

export async function deployDistilledNotes(
  notes: DistilledNote[],
  distilledRoot: string,
): Promise<{ written: string[]; ok: number; reviewed: number; weak: number }> {
  await fs.mkdir(distilledRoot, { recursive: true })
  const made = new Set<string>()
  const written: string[] = []
  let ok = 0
  let reviewed = 0
  let weak = 0
  for (const n of notes) {
    const dest = destinationForQuality(n.quality)
    if (dest === 'keep') ok++
    else if (dest === 'review') reviewed++
    else weak++
    const dir = destDir(distilledRoot, dest)
    if (dest !== 'keep' && !made.has(dest)) {
      await fs.mkdir(dir, { recursive: true })
      made.add(dest)
    }
    await removePriorSessionNotes(distilledRoot, n.sessionId)
    const file = join(dir, noteFilename(n))
    await fs.writeFile(file, n.markdown, 'utf8')
    written.push(file)
  }
  return { written, ok, reviewed, weak }
}

export function relativeUnderDistilled(distilledRoot: string, absPath: string): string {
  const normRoot = distilledRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const norm = absPath.replace(/\\/g, '/')
  if (norm.startsWith(normRoot + '/')) return norm.slice(normRoot.length + 1)
  return basename(absPath)
}
