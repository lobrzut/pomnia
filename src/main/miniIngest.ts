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
 * Conversations are distilled when an Ollama is given, and staged verbatim as
 * transcripts when it is not. Both are recorded per file, because the
 * difference matters later: a distilled note is durable knowledge, a
 * transcript is the raw material it was made from, and an index that cannot
 * tell them apart returns the shape of a conversation instead of its point.
 *
 * The Ollama is the caller's to choose — a box on the LAN, the server, this
 * machine. Nothing here assumes localhost, because the reason to run Mini is
 * usually that the heavy parts live somewhere else.
 */

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { extname, basename, join } from 'node:path'

import {
  applyOcrToDocument,
  buildExtractedMarkdown,
  extractionPathLabel,
  parseDocument,
  runOcr,
} from '@pomnia/doc-parser'

import { STAGING_NOTES_DIR, stagedNoteName } from '@core/brain/miniIngest.js'
import { distillConversation } from '@core/brain/distill.js'
import { defaultOllamaConfig, Ollama } from '@core/brain/ollama.js'
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
  /** True when conversations went in raw because no model was available. */
  rawTranscripts: boolean
}

export interface IngestOptions {
  /** Where a chat model lives. Absent means: stage transcripts, say so. */
  ollamaUrl?: string
  model?: string
  /**
   * Read scanned pages with OCR. On unless switched off.
   *
   * It was opt-in, on the grounds that four seconds a page is expensive. But
   * a PDF with no text layer has exactly one way to yield anything, so asking
   * permission was asking a question with one answer — and the cost of
   * getting it wrong was an empty note that looked like a real one.
   */
  ocr?: boolean
  /**
   * Pages to read. 0, the default, means the whole document.
   *
   * A cap turns a book into a sample of a book, and a sample indexed as
   * knowledge answers questions it has no business answering. Ten minutes
   * once, for a 147-page scan, is the honest price.
   */
  ocrPages?: number
  /**
   * Called while OCR runs. At roughly four seconds a page — measured on a
   * 147-page scan — a whole book is ten minutes, and ten minutes of a
   * spinner is indistinguishable from ten minutes of a hang.
   */
  onProgress?: (ev: { file: string; phase: 'ocr'; done: number; total: number }) => void
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
  return (await stagedStats(userDataDir)).notes
}

/**
 * What is waiting, in notes and in bytes.
 *
 * Bytes because 'how long will this take' has no answer without them, and a
 * count alone hides the difference between thirty checkpoints and one scanned
 * book — which is three orders of magnitude.
 */
export async function stagedStats(userDataDir: string): Promise<{ notes: number; bytes: number }> {
  try {
    const dir = notesDir(userDataDir)
    const entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
    let bytes = 0
    for (const f of entries) {
      try {
        bytes += (await fs.stat(join(dir, f))).size
      } catch {
        /* vanished between listing and stat; it simply will not be sent */
      }
    }
    return { notes: entries.length, bytes }
  } catch {
    return { notes: 0, bytes: 0 }
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
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const dir = notesDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })

  // Ask once, not per conversation: an unreachable Ollama is a fact about
  // the run, and forty timeouts is a slow way to learn it.
  const url = opts.ollamaUrl?.trim()
  // Start from the defaults so the embedding model keeps its usual value —
  // distillation does not use it, but the config requires it and inventing a
  // second default here is how two of them drift apart.
  const ollama = url
    ? new Ollama({
        ...defaultOllamaConfig(),
        baseUrl: url,
        ...(opts.model ? { chatModel: opts.model } : {}),
      })
    : null
  const canDistill = ollama ? await ollama.reachable() : false
  if (url && !canDistill) log.warn('mini ingest: ollama unreachable at', url, '- staging raw')

  const files: IngestedFile[] = []
  let rawTranscripts = false
  for (const p of paths) {
    const ext = extname(p).toLowerCase()
    const name = basename(p)
    try {
      if (DOC_EXTS.has(ext)) {
        const parsed = await parseDocument(p)

        // A scan with no text layer is not a note. Staging it produced a
        // file of pure YAML frontmatter — 3.6 kB from a 147-page book —
        // which the page then counted as '1 note' and the server indexed as
        // knowledge. The frontmatter had recorded the extraction path all
        // along; nothing read it. Refusing is the only honest answer,
        // because the alternative is a memory that confidently contains
        // nothing.
        let doc = parsed
        let ocrNote = ''
        // Pages that actually carry text. Dividing the character count by
        // every page in the file reported 137 chars/page for a book where
        // 127 of 147 pages were blank — a number that described nothing.
        let textPages = 0
        if (opts.ocr !== false && doc.meta.sparse && doc.format === 'pdf') {
          try {
            // 0 means the whole document: the page count is only known here,
            // after parsing, so the caller cannot name it in advance.
            const asked = opts.ocrPages ?? 0
            const pages = asked === 0 ? parsed.meta.pageCount : Math.max(1, asked)
            const ocr = await runOcr(p, {
              prefer: 'tesseract',
              maxPages: pages,
              onProgress: (ev) =>
                opts.onProgress?.({ file: name, phase: 'ocr', done: ev.done, total: ev.total }),
            })
            if (ocr.method !== 'none' && ocr.pages.length > 0) {
              doc = applyOcrToDocument(doc, ocr)
              textPages = ocr.pages.length
              // Say what was read and what was thrown away. OCR over a
              // diagram returns confident nonsense, and '20 pages read' with
              // 9 of them discarded is a different fact from '20 pages of
              // book'.
              const dropped = ocr.dropped ?? 0
              ocrNote =
                ` — OCR: ${ocr.pages.length}/${parsed.meta.pageCount} str.` +
                (dropped ? `, odrzucone jako obrazki: ${dropped}` : '')
            }
          } catch (e) {
            log.warn('ocr failed for', name, e)
          }
        }

        const countedPages = textPages || doc.meta.pageCount
        const perPage = doc.meta.charCount / Math.max(1, countedPages)
        if (doc.meta.charCount === 0) {
          files.push({
            file: name,
            kind: 'document',
            notes: 0,
            detail: `${parsed.meta.pageCount} str.`,
            error:
              opts.ocr === false
                ? 'skan bez warstwy tekstowej — OCR wyłączony'
                : 'skan bez warstwy tekstowej — OCR też nic nie odczytał',
          })
          continue
        }

        const bytes = await fs.readFile(p)
        const md = buildExtractedMarkdown(doc.markdown, {
          source_file: name,
          source_sha256: createHash('sha256').update(bytes).digest('hex'),
          format: doc.format,
          extraction_tier: doc.meta.tier,
          extraction_sparse: doc.meta.sparse,
          extraction_path: extractionPathLabel(doc),
          pages: doc.meta.pageCount,
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
          // Characters per page, because that is the number that says
          // whether the text is really there. A sparse result is still
          // staged — partial text beats none — but it says so.
          detail:
            `${extractionPathLabel(doc)}, ${doc.meta.pageCount} str., ` +
            `${Math.round(perPage)} zn./str. z ${countedPages}` +
            (doc.meta.sparse ? ' — rzadki tekst, prawdopodobnie skan' : '') +
            ocrNote,
        })
      } else if (EXPORT_EXTS.has(ext)) {
        const r = await parseExportFile(p)
        let distilled = 0
        for (const c of r.conversations) {
          let body: string | null = null
          if (ollama && canDistill) {
            try {
              const note = await distillConversation(c, ollama, opts.model)
              // The distiller says outright when it found nothing durable.
              // Keeping those would fill the memory with notes that exist
              // only to say a conversation happened.
              if (note.quality !== 'ok') continue
              body = note.markdown
              distilled++
            } catch (e) {
              log.warn('distill failed for', c.title, e)
            }
          }
          if (!body) {
            body = conversationMarkdown(c.title || name, c.source, c.messages ?? [])
            rawTranscripts = true
          }
          await writeNote(dir, stagedNoteName(c.title || name), body)
        }
        files.push({
          file: name,
          kind: 'export',
          notes: r.conversations.length,
          // Say which of the two happened, and how many survived the quality
          // gate: 34 conversations becoming 9 notes is the normal outcome and
          // looks like a bug when it is not explained.
          detail: canDistill
            ? `${r.detected} — destylacja: ${distilled}/${r.conversations.length}`
            : `${r.detected} — transkrypty`,
        })
      } else {
        // Name the way out, not just the refusal. MOBI and AZW are the ones
        // people actually have, and 'unsupported' leaves them guessing whether
        // the file is broken or the format simply is not read here.
        const convertible = ['.mobi', '.azw', '.azw3', '.prc'].includes(ext)
        files.push({
          file: name,
          kind: 'document',
          notes: 0,
          detail: ext,
          error: convertible
            ? `${ext} — przekonwertuj na EPUB (np. Calibre)`
            : `${ext} — obsługiwane: PDF, DOCX, EPUB, MD, TXT oraz ZIP/JSON/JSONL`,
        })
      }
    } catch (e) {
      log.warn('mini ingest failed for', name, e)
      files.push({ file: name, kind: 'document', notes: 0, detail: ext, error: (e as Error).message })
    }
  }

  return { files, staged: await stagedCount(userDataDir), rawTranscripts }
}
