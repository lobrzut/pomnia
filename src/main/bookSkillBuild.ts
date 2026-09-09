// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Book on disk → one skill in the vault.
 *
 * The shape and the limits live in `@core/skills/bookSkill` and are tested
 * without a model. This file is the part that needs the world: parsing the
 * document, asking Ollama for the prose a mechanical split cannot produce, and
 * writing the result somewhere real.
 *
 * Two safety rules, both because this writes into the skills tree an agent
 * reads from:
 *
 *   - **Never overwrite.** If the target directory exists, this refuses. A book
 *     re-imported under the same name must not silently replace a skill the
 *     user has since edited by hand.
 *   - **All or nothing.** Files are assembled in memory and written only after
 *     every one of them exists, into a temporary directory that is renamed into
 *     place. A half-written skill is worse than none: `list_skills` would show
 *     it and `get_skill` would return a stub.
 *
 * Distillation is per chapter and deliberately small. One short call each keeps
 * a 40-chapter book inside a sane wall-clock time and keeps any single failure
 * cheap — a chapter whose summary fails still ships, just without its index
 * line, because the chapter file is the thing that matters.
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { parseDocument, applyOcrToDocument, runOcr, suggestOcr } from '@pomnia/doc-parser'

import {
  buildSkillPackage,
  chaptersFromMarkdown,
  slugFromTitle,
  type Chapter,
} from '@core/skills/bookSkill.js'
import { Ollama, defaultOllamaConfig } from '@core/brain/ollama.js'
import { log } from '@core/index.js'

export interface BookSkillProgress {
  phase: 'parsing' | 'ocr' | 'chapters' | 'distilling' | 'writing'
  done?: number
  total?: number
  detail?: string
}

export interface BookSkillOptions {
  filePath: string
  /** `cli/<category>/<slug>/`. Defaults to a general bucket. */
  category?: string
  /** Overrides the slug derived from the filename. */
  slug?: string
  skillsRoot: string
  ollamaUrl?: string
  model?: string
  onProgress?: (p: BookSkillProgress) => void
  signal?: AbortSignal
}

export type BookSkillResult =
  | { ok: true; slug: string; path: string; chapters: number; warnings: string[] }
  | { ok: false; error: string }

/** `cli/<category>/` — same rule the skills reader applies, so a written skill is a listed skill. */
function isSafeCategory(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name) && !name.startsWith('_')
}

/** Ask for one line. Failure is not fatal — the chapter still ships. */
async function summarise(
  ollama: Ollama,
  chapter: Chapter,
  model: string | undefined,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const excerpt = chapter.text.slice(0, 4000)
  try {
    const out = await ollama.generate(
      `Poniżej fragment rozdziału książki technicznej. Napisz JEDNO zdanie (maks. 20 słów) ` +
        `mówiące, czego ten rozdział dotyczy i kiedy warto po niego sięgnąć. ` +
        `Odpowiedz w języku fragmentu. Bez wstępu, samo zdanie.\n\n---\n${excerpt}`,
      { model, temperature: 0.1, timeoutMs: 90_000, signal },
    )
    const line = out.trim().split('\n')[0]?.trim()
    return line && line.length > 3 ? line.replace(/^["'-]\s*/, '').slice(0, 200) : undefined
  } catch (e) {
    log.warn(`book-skill: chapter ${chapter.index} summary failed: ${(e as Error).message}`)
    return undefined
  }
}

/** One call for the prose that spans the whole book. Absent sections simply produce no file. */
async function distilWhole(
  ollama: Ollama,
  title: string,
  chapters: Chapter[],
  model: string | undefined,
  signal?: AbortSignal,
): Promise<{ mentalModels?: string; glossary?: string; patterns?: string; cheatsheet?: string }> {
  // A spread across the book rather than the opening pages: the first chapter of
  // a technical book is usually preface, and a glossary built from it is useless.
  const sample = chapters
    .map((c) => `## ${c.title}\n${c.text.slice(0, 1200)}`)
    .join('\n\n')
    .slice(0, 24_000)

  const ask = async (instruction: string, timeoutMs = 180_000): Promise<string | undefined> => {
    try {
      const out = await ollama.generate(`${instruction}\n\n---\n${sample}`, {
        model,
        temperature: 0.2,
        timeoutMs,
        signal,
      })
      const t = out.trim()
      return t.length > 20 ? t : undefined
    } catch (e) {
      log.warn(`book-skill: section failed: ${(e as Error).message}`)
      return undefined
    }
  }

  const mentalModels = await ask(
    `Na podstawie poniższych fragmentów książki „${title}" wypisz 3–6 modeli myślowych — ` +
      `zasad, które ta książka wnosi i które zmieniają sposób podejmowania decyzji. ` +
      `Każdy jako punkt listy, jedno–dwa zdania. Bez wstępu. Odpowiedz w języku źródła.`,
  )
  const glossary = await ask(
    `Wypisz kluczowe pojęcia z tych fragmentów jako listę „termin — krótkie wyjaśnienie". ` +
      `Tylko terminy faktycznie występujące w tekście. Bez wstępu.`,
  )
  const patterns = await ask(
    `Wypisz techniki i wzorce z tych fragmentów. Każdy jako: nazwa, jedno zdanie co robi, ` +
      `i warunek „użyj, gdy…". Bez wstępu.`,
  )
  const cheatsheet = await ask(
    `Zbuduj zwięzłą ściągę z tych fragmentów: tabele decyzyjne, reguły kciuka, wartości ` +
      `domyślne — to, do czego zagląda się w trakcie pracy. Markdown. Bez wstępu.`,
  )

  return { mentalModels, glossary, patterns, cheatsheet }
}

export async function buildBookSkill(opts: BookSkillOptions): Promise<BookSkillResult> {
  const category = opts.category?.trim() || 'general'
  if (!isSafeCategory(category)) return { ok: false, error: `bad category: ${category}` }
  if (!opts.skillsRoot) return { ok: false, error: 'no skills root — open a vault first' }

  const report = (p: BookSkillProgress): void => opts.onProgress?.(p)

  // 1. Parse, with OCR when the text layer is sparse — the same rule import uses,
  //    because a scanned book with no OCR yields an empty skill.
  report({ phase: 'parsing', detail: opts.filePath })
  let doc
  try {
    doc = await parseDocument(opts.filePath)
    if (suggestOcr(doc)) {
      // Same rule and the same whole-document setting import uses: three sampled
      // pages indexed as a book answers questions it has no business answering.
      report({ phase: 'ocr', detail: 'skan bez warstwy tekstowej' })
      const ocr = await runOcr(opts.filePath, {
        prefer: 'tesseract',
        maxPages: doc.meta.pageCount || 0,
        onProgress: (ev: { done: number; total: number; page: number }) =>
          report({ phase: 'ocr', done: ev.done, total: ev.total, detail: `str. ${ev.page}` }),
      })
      doc = applyOcrToDocument(doc, ocr)
    }
  } catch (e) {
    return { ok: false, error: `parse failed: ${(e as Error).message}` }
  }
  if (!doc.markdown.trim()) {
    return { ok: false, error: 'the document yielded no text — nothing to turn into a skill' }
  }

  // 2. Split. Mechanical, no model.
  report({ phase: 'chapters' })
  const chapters = chaptersFromMarkdown(doc.markdown)
  if (chapters.length === 0) return { ok: false, error: 'no chapters could be derived' }

  const title = opts.slug?.trim() || basenameNoExt(opts.filePath)
  const slug = slugFromTitle(opts.slug?.trim() || title)
  const target = join(opts.skillsRoot, 'cli', category, slug)
  // Checked before spending minutes on a model: refusing early is kinder than
  // refusing after the work.
  if (existsSync(target)) {
    return { ok: false, error: `skill already exists: cli/${category}/${slug} — rename or remove it first` }
  }

  // 3. Distil.
  const ollama = new Ollama({
    ...defaultOllamaConfig(),
    ...(opts.ollamaUrl ? { baseUrl: opts.ollamaUrl } : {}),
  })
  const withSummaries: Chapter[] = []
  for (const [i, ch] of chapters.entries()) {
    if (opts.signal?.aborted) return { ok: false, error: 'cancelled' }
    report({ phase: 'distilling', done: i, total: chapters.length, detail: ch.title })
    withSummaries.push({ ...ch, summary: await summarise(ollama, ch, opts.model, opts.signal) })
  }
  report({ phase: 'distilling', done: chapters.length, total: chapters.length })
  const prose = await distilWhole(ollama, title, chapters, opts.model, opts.signal)

  // 4. Assemble and write all-or-nothing.
  const pkg = buildSkillPackage({
    slug,
    title,
    description:
      `Wiedza z „${title}". Sięgnij, gdy pytanie dotyczy tematu tej książki — ` +
      `SKILL.md jest indeksem, rozdziały czytaj pojedynczo.`,
    chapters: withSummaries,
    source: opts.filePath,
    ...prose,
  })

  report({ phase: 'writing', total: pkg.files.length })
  const staging = mkdtempSync(join(tmpdir(), 'pomnia-skill-'))
  try {
    for (const f of pkg.files) {
      const abs = join(staging, f.path)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, f.content, 'utf8')
    }
    mkdirSync(dirname(target), { recursive: true })
    // Re-check under the rename: minutes have passed since the first check.
    if (existsSync(target)) {
      return { ok: false, error: `skill appeared while building: cli/${category}/${slug}` }
    }
    renameSync(staging, target)
  } catch (e) {
    rmSync(staging, { recursive: true, force: true })
    return { ok: false, error: `write failed: ${(e as Error).message}` }
  }

  return {
    ok: true,
    slug,
    path: `cli/${category}/${slug}`,
    chapters: pkg.files.filter((f) => f.path.startsWith('chapters/')).length,
    warnings: pkg.warnings,
  }
}

function basenameNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? 'skill'
  return base.replace(/\.[a-z0-9]+$/i, '')
}
