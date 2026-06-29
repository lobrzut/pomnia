import type { DetectedSource, SourceId } from '../model.js'
import type { Adapter } from './types.js'
import { claudeCodeAdapter } from './claudeCode.js'
import { cursorAdapter } from './cursor.js'
import { makeProfileAdapter } from './profile.js'

export const ADAPTERS: Adapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  makeProfileAdapter('claude-desktop'),
  makeProfileAdapter('antigravity'),
  makeProfileAdapter('vscode'),
  makeProfileAdapter('windsurf'),
  makeProfileAdapter('continue')
]

export function getAdapter(id: SourceId): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id)
}

/** Detect every known assistant on the current machine, in parallel. */
export async function detectAll(): Promise<DetectedSource[]> {
  const results = await Promise.all(
    ADAPTERS.map(async (a) => {
      try {
        return await a.detect()
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is DetectedSource => r !== null)
}

export type { Adapter } from './types.js'
