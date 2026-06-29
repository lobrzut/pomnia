/** Brain pipeline — public API. Collect (engine) → Distill → Pre-index → Deploy. */
export { Ollama, defaultOllamaConfig } from './ollama.js'
export type { OllamaConfig, OllamaModel } from './ollama.js'
export { distillConversation, assembleNote, transcript, sanitizeUnicode } from './distill.js'
export type { DistilledNote } from './distill.js'
export {
  buildIndex,
  saveIndex,
  loadIndex,
  searchIndex,
  chunkText,
  cosine
} from './localIndex.js'
export type { LocalIndex, IndexEntry, SearchHit, NoteForIndex } from './localIndex.js'
export { deployFilesystem, deployDashboard, triggerReindex, noteFilename } from './deploy.js'
export { listAllSkills, syncSkills, readLocalIndex } from './skills.js'
export type { SkillKind, SkillListEntry, SkillSyncResult } from './skills.js'
export { CLIENTS, getClient, listClients, buildSnippet } from './snippet.js'
export type { ClientId, ClientSpec, Snippet } from './snippet.js'
export { checkClient, checkAllClients, pingBrain } from './status.js'
export type { ClientStatus, WiredState, BrainPing } from './status.js'

import type { Conversation } from '../model.js'
import { Ollama } from './ollama.js'
import { distillConversation, type DistilledNote } from './distill.js'

export interface PipelineProgress {
  phase: 'distill' | 'index'
  done: number
  total: number
  detail?: string
}

/** Distill many conversations on the host, with progress + resilience. */
export async function distillAll(
  conversations: Conversation[],
  ollama: Ollama,
  model?: string,
  onProgress?: (p: PipelineProgress) => void
): Promise<DistilledNote[]> {
  const out: DistilledNote[] = []
  let done = 0
  for (const c of conversations) {
    try {
      out.push(await distillConversation(c, ollama, model))
    } catch {
      /* skip a single failed conversation; keep the batch going */
    }
    onProgress?.({ phase: 'distill', done: ++done, total: conversations.length, detail: c.title })
  }
  return out
}
