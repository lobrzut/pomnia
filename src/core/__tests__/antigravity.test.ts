import { describe, expect, it } from 'vitest'
import { readAntigravityTranscripts } from '../adapters/antigravity.js'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('antigravity adapter', () => {
  it('parses Cascade transcript.jsonl into conversations', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-'))
    const sessionId = '378dc290-360d-48bf-8f0c-f68d4444152e'
    const logDir = path.join(home, '.gemini', 'antigravity', 'brain', sessionId, '.system_generated', 'logs')
    await fs.mkdir(logDir, { recursive: true })
    await fs.writeFile(
      path.join(logDir, 'transcript.jsonl'),
      [
        '{"step_index":0,"source":"USER_EXPLICIT","type":"USER_INPUT","status":"DONE","created_at":"2026-06-28T15:30:08Z","content":"<USER_REQUEST>\\nCzy Cursor jest na Macu?\\n</USER_REQUEST>"}',
        '{"step_index":1,"source":"SYSTEM","type":"CONVERSATION_HISTORY","status":"DONE","created_at":"2026-06-28T15:30:08Z"}',
        '{"step_index":2,"source":"MODEL","type":"PLANNER_RESPONSE","status":"DONE","created_at":"2026-06-28T15:30:12Z","content":"Tak, Cursor działa na macOS."}'
      ].join('\n'),
      'utf8'
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].source).toBe('antigravity')
    expect(convs[0].id).toBe(sessionId)
    expect(convs[0].title).toContain('Cursor')
    expect(convs[0].messages.length).toBeGreaterThanOrEqual(2)
    expect(convs[0].messages[0].role).toBe('user')
    expect(convs[0].messages.some((m) => m.role === 'assistant' && m.text.includes('macOS'))).toBe(true)
  })
})
