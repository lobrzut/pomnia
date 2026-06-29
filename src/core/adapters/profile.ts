import path from 'node:path'
import type { BackupOptions, Conversation, DetectedSource, OS, SourceId } from '../model.js'
import { descriptorFor } from '../locations.js'
import { parseJsonlTree } from './claudeJsonl.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import type { Adapter } from './types.js'

/**
 * Generic snapshot adapter for Electron/VS-Code-style assistants whose chat data
 * lives in opaque stores (leveldb / SharedStorage / sqlite). We capture the
 * profile verbatim (minus caches) for high-fidelity restore. Claude Desktop also
 * gets light structured extraction of its local JSONL agent sessions.
 */
export function makeProfileAdapter(id: SourceId): Adapter {
  const desc = descriptorFor(id)!
  const adapter: Adapter = {
    id,
    label: desc.label,
    resolveRoot: (os: OS, home: string) => desc.root(os, home),
    detect: (): Promise<DetectedSource> => baseDetect(id),
    collectFiles: (root: string, opts: BackupOptions) => collectFilesFromDescriptor(id, root, opts)
  }

  if (id === 'claude-desktop') {
    adapter.collectConversations = async (root: string): Promise<Conversation[]> => {
      const dirs = ['claude-code-sessions', 'local-agent-mode-sessions', 'claude-code']
      const all: Conversation[] = []
      for (const d of dirs) all.push(...(await parseJsonlTree(path.join(root, d), id)))
      return all
    }
  }
  return adapter
}
