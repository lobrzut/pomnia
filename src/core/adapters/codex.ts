// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import path from 'node:path'

import type { BackupOptions, Conversation, DetectedSource, OS } from '../model.js'
import { descriptorFor } from '../locations.js'
import { countFilesMatching } from '../fsutil.js'
import { parseCodexTree } from './codexJsonl.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import type { Adapter } from './types.js'

const ID = 'codex' as const

export const codexAdapter: Adapter = {
  id: ID,
  label: 'Codex',
  resolveRoot: (os: OS, home: string) => descriptorFor(ID)!.root(os, home),

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    if (d.installed) {
      // Only rollouts count as conversations; the same tree holds other files.
      // The pattern is tested against the *relative path* — rollouts sit under
      // `<yyyy>/<mm>/<dd>/`, so anchoring it at the start would match nothing.
      // `walk` normalises separators to `/`, so this holds on Windows too.
      d.conversations = await countFilesMatching(
        path.join(d.root, 'sessions'),
        /(^|\/)rollout-[^/]*\.jsonl$/i
      )
    }
    return d
  },

  async collectConversations(root: string): Promise<Conversation[]> {
    return parseCodexTree(path.join(root, 'sessions'), ID)
  },

  collectFiles(root: string, opts: BackupOptions) {
    return collectFilesFromDescriptor(ID, root, opts)
  }
}
