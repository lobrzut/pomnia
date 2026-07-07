/**
 * Bridge to alice's Brain. Converts captured conversations into markdown notes
 * compatible with Brain's `data/vault/` ingest format, so a Pomnia backup can
 * directly feed the RAG inbox (then re-distilled locally by Ollama). This is the
 * "stop wasting context across sessions" play.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Conversation } from './model.js'

function slug(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'untitled'
}

export function conversationToMarkdown(c: Conversation): string {
  const date = (c.updatedAt || c.createdAt || new Date().toISOString()).slice(0, 10)
  const id8 = c.id.slice(0, 8)
  const fm = [
    '---',
    `source: ${c.source}`,
    `session: ${c.id}`,
    `project: ${c.title.replace(/\n/g, ' ')}`,
    `date: ${date}`,
    `msg_count: ${c.messages.length}`,
    'exported_via: pomnia',
    '---',
    ''
  ].join('\n')

  const body = c.messages
    .map((m) => {
      const ts = m.ts ? ` (${m.ts})` : ''
      return `**${m.role}**${ts}:\n\n${m.text}\n`
    })
    .join('\n')

  return `${fm}# ${date} · ${c.source} · ${id8}\n\n## ${c.title}\n\n${body}`
}

/** Write conversations as individual markdown notes into a target dir. Returns paths. */
export async function exportConversationsToDir(
  conversations: Conversation[],
  outDir: string
): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true })
  const written: string[] = []
  for (const c of conversations) {
    const date = (c.updatedAt || c.createdAt || new Date().toISOString()).slice(0, 10)
    const name = `${date}_${c.source}_${slug(c.title)}_${c.id.slice(0, 8)}.md`
    const file = path.join(outDir, name)
    await fs.writeFile(file, conversationToMarkdown(c), 'utf8')
    written.push(file)
  }
  return written
}
