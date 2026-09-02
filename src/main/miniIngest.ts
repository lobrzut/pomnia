// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * "Do Pomnia" — take files, turn them into notes, send them to the server.
 *
 * Mini has no vault, so nothing here writes to one. Parsed material lands in a
 * staging directory under Mini's own userData, shaped like a vault surface, and
 * `pushStagedNotes` hands that directory to the client replication already
 * uses. Staging is not a cache: it is what the person can inspect before
 * anything leaves the machine, and what survives a failed push so a retry does
 * not mean parsing a 400-page PDF again.
 *
 * Two kinds of input, told apart by extension rather than by asking:
 *
 * - Documents (pdf, docx, epub, md, txt) go through doc-parser, which already
 *   handles the awkward parts — a PDF whose text layer is empty falls back to
 *   OCR, and the frontmatter records which path produced the text so a bad
 *   extraction is recognisable later instead of silently becoming knowledge.
 * - Agent exports (zip, json, jsonl) go through `parseExportFile`, which
 *   detects the origin itself: ChatGPT, Claude, Gemini, Grok, or generic. That
 *   detection is why this does not ask the user which assistant a file came
 *   from — the file says so, and a person picking from a list gets it wrong.
 *
 * Conversations are staged verbatim, as transcripts. Distilling them needs a
 * chat model and that is the next piece; a transcript in the memory is worth
 * more than a transcript on a disk nobody searches, and it is honest about
 * being raw.
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, basename, join } from 'node:path'

import { buildExtractedMarkdown, extractionPathLabel, parseDocument } from '@pomnia/doc-parser'

import { STAGING_NOTES_DIR, stagedNoteName } from '@core/brain/miniIngest.js'
import { parseExportFile } from '@core/import/archives.js'
import { log } from '@core/index.js'

export const DOC_EXTS = new Set(['.pdf', '.docx', '.md', '.markdown', '.txt', '.epub'])
export const EXPORT_EXTS = new Set(['.zip', '.json', '.jsonl'])

export interface IngestedFile {
  file: string
  kind: 'document' | 'export'
  /** Notes written for this file. An export can yield many. */
  notes: number
  /** For documents: which parser produced the text. For exports: the origin. */
  detail: string
  error?: string
}

export interface IngestSummary {
  files: IngestedFile[]
  staged: number
}

/** Everything Mini has parsed and not yet sent. */
export function stagingRoot(userDataDir: string): string {
  return join(userDataDir, 'ingest-staging')
}

function notesDir(userDataDir: string): string {
  return join(stagingRoot(userDataDir), STAGING_NOTES_DIR)
}

/** How many notes are waiting to be sent. */
export async function stagedCount(userDataDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(notesDir(userDataDir))
    return entries.filter((f) => f.endsWith('.md')).length
  } catch {
    return 0
  }
}

/** Forget what is staged — after a successful push, or when asked. */
export async function clearStaging(userDataDir: string): Promise<void> {
  await fs.rm(stagingRoot(userDataDir), { recursive: true, force: true })
}

/**
 * Write one note, without ever overwriting another.
 *
 * Two chapters of one book, or two conversations exported on the same day,
 * would otherwise collide on the dated name and the second would silently
 * replace the first — losing material the person believes they imported.
 */
async function writeNote(dir: string, name: string, body: string): Promise<void> {
  const stem = name.replace(/\.md$/, '')
  for (let n = 0; ; n++) {
    const candidate = join(dir, n === 0 ? `${stem}.md` : `${stem}-${n}.md`)
    try {
      await fs.writeFile(candidate, body, { encoding: 'utf8', flag: 'wx' })
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
    }
  }
}

function conversationMarkdown(
  title: string,
  source: string,
  messages: { role?: string; content?: string }[],
): string {
  const head = ['---', `source: ${source}`, 'imported_via: pomnia-mini', '---', '', `# ${title}`, '']
  const body = messages
    .filter((m) => (m.content ?? '').trim())
    .map((m) => `**${m.role ?? 'unknown'}:**\n\n${(m.content ?? '').trim()}`)
  return [...head, ...body].join('\n')
}

/**
 * Parse the given paths into staged notes.
 *
 * One bad file does not stop the rest. A corrupt PDF in a folder of forty is a
 * fact about that file, and aborting the batch for it would make the person
 * find the bad one by bisection.
 */
export async function ingestFiles(
  userDataDir: string,
  paths: string[],
): Promise<IngestSummary> {
  const dir = notesDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })

  const files: IngestedFile[] = []
  for (const p of paths) {
    const ext = extname(p).toLowerCase()
    const name = basename(p)
    try {
      if (DOC_EXTS.has(ext)) {
        const parsed = await parseDocument(p)
        const bytes = await fs.readFile(p)
        const md = buildExtractedMarkdown(parsed.markdown, {
          source_file: name,
          source_sha256: createHash('sha256').update(bytes).digest('hex'),
          format: parsed.format,
          extraction_tier: parsed.meta.tier,
          extraction_sparse: parsed.meta.sparse,
          extraction_path: extractionPathLabel(parsed),
          pages: parsed.meta.pageCount,
          imported_at: new Date().toISOString(),
          imported_via: 'pomnia-mini',
        })
        await writeNote(dir, stagedNoteName(name), md)
        files.push({
          file: name,
          kind: 'document',
          notes: 1,
          // Say which path produced the text: an OCR fallback is a different
          // quality of material than a real text layer, and it matters later.
          detail: `${extractionPathLabel(parsed)}, ${parsed.meta.pageCount} str.`,
        })
      } else if (EXPORT_EXTS.has(ext)) {
        const r = await parseExportFile(p)
        for (const c of r.conversations) {
          await writeNote(
            dir,
            stagedNoteName(c.title || name),
            conversationMarkdown(c.title || name, c.source, c.messages ?? []),
          )
        }
        files.push({
          file: name,
          kind: 'export',
          notes: r.conversations.length,
          detail: r.detected,
        })
      } else {
        files.push({ file: name, kind: 'document', notes: 0, detail: ext, error: 'unsupported' })
      }
    } catch (e) {
      log.warn('mini ingest failed for', name, e)
      files.push({ file: name, kind: 'document', notes: 0, detail: ext, error: (e as Error).message })
    }
  }

  return { files, staged: await stagedCount(userDataDir) }
}
