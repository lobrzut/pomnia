/**
 * Host-side preliminary indexing. Embeds distilled notes locally (nomic-embed-text
 * via Ollama) into a portable JSON index, so the user gets semantic search over
 * their imported knowledge *immediately on the host* — before, or without, any
 * deploy to Brain. Because it uses the same embedding model Brain uses, the vectors
 * are deploy-ready (a future Brain endpoint can merge them and skip re-embedding).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Ollama } from './ollama.js'
import { log } from '../log.js'

export interface IndexEntry {
  id: string
  source: string
  notePath: string
  chunkIdx: number
  text: string
  vector: number[]
}

export interface LocalIndex {
  embedModel: string
  dim: number
  createdAt: string
  entries: IndexEntry[]
}

export interface SearchHit {
  score: number
  source: string
  notePath: string
  text: string
}

/** Split a note into overlapping ~1500-char chunks on paragraph boundaries. */
export function chunkText(text: string, target = 1500, overlap = 200): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paras) {
    if (buf && buf.length + p.length > target) {
      chunks.push(buf)
      buf = buf.slice(Math.max(0, buf.length - overlap))
    }
    buf += (buf ? '\n\n' : '') + p
  }
  if (buf.trim()) chunks.push(buf)
  return chunks.length ? chunks : [text]
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

export interface NoteForIndex {
  source: string
  notePath: string
  text: string
}

/** Build an index from notes by embedding their chunks. */
export async function buildIndex(
  notes: NoteForIndex[],
  ollama: Ollama,
  onProgress?: (done: number, total: number) => void
): Promise<LocalIndex> {
  const entries: IndexEntry[] = []
  let dim = 0
  let done = 0
  for (const note of notes) {
    const chunks = chunkText(note.text)
    const vectors = await ollama.embed(chunks)
    chunks.forEach((text, i) => {
      const v = vectors[i] ?? []
      if (v.length) dim = v.length
      entries.push({
        id: crypto.randomUUID(),
        source: note.source,
        notePath: note.notePath,
        chunkIdx: i,
        text,
        vector: v
      })
    })
    onProgress?.(++done, notes.length)
  }
  return { embedModel: ollama.cfg.embedModel, dim, createdAt: new Date().toISOString(), entries }
}

export async function saveIndex(index: LocalIndex, file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(index))
  log.info('local index saved', file, `${index.entries.length} chunks, dim ${index.dim}`)
}

export async function loadIndex(file: string): Promise<LocalIndex> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as LocalIndex
}

/** Semantic search over a local index. */
export async function searchIndex(
  index: LocalIndex,
  query: string,
  ollama: Ollama,
  k = 6
): Promise<SearchHit[]> {
  const [qv] = await ollama.embed([query])
  return index.entries
    .map((e) => ({ score: cosine(qv, e.vector), source: e.source, notePath: e.notePath, text: e.text }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
