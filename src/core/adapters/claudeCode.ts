import path from 'node:path'
import type { BackupOptions, Conversation, DetectedSource, OS } from '../model.js'
import { descriptorFor } from '../locations.js'
import { countFilesMatching } from '../fsutil.js'
import { parseJsonlTree } from './claudeJsonl.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import type { Adapter } from './types.js'

const ID = 'claude-code' as const

export const claudeCodeAdapter: Adapter = {
  id: ID,
  label: 'Claude Code',
  resolveRoot: (os: OS, home: string) => descriptorFor(ID)!.root(os, home),

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    if (d.installed) {
      d.conversations = await countFilesMatching(path.join(d.root, 'projects'), /\.jsonl$/i)
    }
    return d
  },

  async collectConversations(root: string): Promise<Conversation[]> {
    return parseJsonlTree(path.join(root, 'projects'), ID)
  },

  collectFiles(root: string, opts: BackupOptions) {
    return collectFilesFromDescriptor(ID, root, opts)
  }
}
