// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * List / read / promote notes under distilled/_review and distilled/_weak.
 * Promote is user-driven only — never auto.
 */
import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { upsertQualityFrontmatter } from '../core/brain/qualityGate.js'
import { brainVaultDistilledDir } from './brainPaths.js'

export type QuarantineBucket = 'review' | 'weak'

export interface QuarantineNoteMeta {
  bucket: QuarantineBucket
  name: string
  mtimeMs: number
  sizeBytes: number
}

function bucketDir(bucket: QuarantineBucket): string {
  return join(brainVaultDistilledDir(), bucket === 'review' ? '_review' : '_weak')
}

function safeName(name: string): string {
  const base = basename(name)
  if (!base || base !== name.replace(/\\/g, '/').split('/').pop() || base.includes('..')) {
    throw new Error('invalid note name')
  }
  if (!base.endsWith('.md')) throw new Error('only .md notes')
  return base
}

async function listBucket(bucket: QuarantineBucket): Promise<QuarantineNoteMeta[]> {
  const dir = bucketDir(bucket)
  let ents
  try {
    ents = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: QuarantineNoteMeta[] = []
  for (const ent of ents) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue
    try {
      const st = await fs.stat(join(dir, ent.name))
      out.push({ bucket, name: ent.name, mtimeMs: st.mtimeMs, sizeBytes: st.size })
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export async function listQuarantineNotes(): Promise<{
  review: QuarantineNoteMeta[]
  weak: QuarantineNoteMeta[]
}> {
  const [review, weak] = await Promise.all([listBucket('review'), listBucket('weak')])
  return { review, weak }
}

export async function readQuarantineNote(bucket: QuarantineBucket, name: string): Promise<string> {
  const file = join(bucketDir(bucket), safeName(name))
  return fs.readFile(file, 'utf8')
}

/** Move note from _review/_weak into distilled/ root; set quality: ok. */
export async function promoteQuarantineNote(
  bucket: QuarantineBucket,
  name: string,
): Promise<{ name: string; path: string }> {
  const base = safeName(name)
  const src = join(bucketDir(bucket), base)
  const dest = join(brainVaultDistilledDir(), base)
  try {
    await fs.access(src)
  } catch {
    throw new Error('note not found')
  }
  const destExists = await fs.access(dest).then(() => true).catch(() => false)
  if (destExists) throw new Error(`already exists in distilled/: ${base}`)
  let md = await fs.readFile(src, 'utf8')
  md = upsertQualityFrontmatter(md, 'ok', 5)
  await fs.writeFile(dest, md, 'utf8')
  await fs.unlink(src)
  return { name: base, path: dest }
}
