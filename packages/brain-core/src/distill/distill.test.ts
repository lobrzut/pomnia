// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { assembleNote, coerceFields } from './note.js'
import { GARBAGE_THRESHOLD, scoreFields } from './quality.js'
import { createDistillJob, distillRunnable } from './job.js'
import { distillConversation, isWorthDistilling } from './engine.js'
import { deployDistilledNotes } from './deploy.js'
import type { DistillConversation } from './types.js'

const longEnough = (n: number) => 'x'.repeat(n)

function sampleConv(over: Partial<DistillConversation> = {}): DistillConversation {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    source: 'cursor',
    title: 'Sample session',
    messages: [
      { role: 'user', text: longEnough(80) + ' please fix /opt/pomnia and run npm test' },
      { role: 'assistant', text: longEnough(80) + ' use systemctl restart and curl http://192.168.1.201:7865' },
      { role: 'user', text: longEnough(80) + ' also check BRAIN_DISTILL=1' },
    ],
    ...over,
  }
}

describe('quality gate', () => {
  it('scores specific bullets above garbage threshold', () => {
    const score = scoreFields({
      summary: 'Fixed distill on .201',
      decisions: ['Port distill.ts into brain-core with qwen2.5:14b'],
      solutions: ['Use POST /admin/distill + brain-core --distill'],
      facts: ['Ollama at http://192.168.1.201:11434', 'GARBAGE_THRESHOLD=5.0'],
      openQuestions: [],
    })
    expect(score).toBeGreaterThanOrEqual(GARBAGE_THRESHOLD)
  })

  it('marks empty notes as stub', () => {
    const note = assembleNote(sampleConv(), {
      summary: '',
      decisions: [],
      solutions: [],
      facts: [],
      openQuestions: [],
    }, 'qwen2.5:14b')
    expect(note.quality).toBe('stub')
    expect(note.score).toBe(0)
  })

  it('coerceFields reads open_questions', () => {
    const f = coerceFields(JSON.stringify({
      summary: 's',
      decisions: ['d'],
      solutions: [],
      facts: [],
      open_questions: ['q'],
    }))
    expect(f.openQuestions).toEqual(['q'])
  })
})

describe('isWorthDistilling', () => {
  it('skips short chats', () => {
    expect(
      isWorthDistilling({
        id: '1',
        source: 'x',
        title: 'hi',
        messages: [
          { role: 'user', text: 'hi' },
          { role: 'assistant', text: 'yo' },
        ],
      }),
    ).toBe(false)
  })

  it('accepts long enough chats', () => {
    expect(isWorthDistilling(sampleConv())).toBe(true)
  })
})

describe('distillRunnable', () => {
  it('blocks read-only', () => {
    const r = distillRunnable({
      enabled: true,
      model: 'qwen2.5:14b',
      ollamaUrl: 'http://127.0.0.1:11434',
      vaultRoot: '/tmp/v',
      writable: false,
      readOnlyFlag: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/read-only/)
  })

  it('blocks BRAIN_DISTILL=0', () => {
    const r = distillRunnable({
      enabled: false,
      model: 'qwen2.5:14b',
      ollamaUrl: 'http://127.0.0.1:11434',
      vaultRoot: '/tmp/v',
      writable: true,
      readOnlyFlag: false,
    })
    expect(r.ok).toBe(false)
  })
})

describe('engine + deploy (mock generate)', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'pomnia-distill-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes ok notes to distilled/', async () => {
    const conv = sampleConv()
    const note = await distillConversation(conv, {
      ollamaUrl: 'http://127.0.0.1:9',
      model: 'qwen2.5:14b',
      generate: async () =>
        JSON.stringify({
          title: 'Distill MVP',
          summary: 'Ported distill to brain-core',
          decisions: ['Linux SoT owns distill on GPU Ollama'],
          solutions: ['POST /admin/distill; brain-core --distill'],
          facts: ['GARBAGE_THRESHOLD 5.0', 'model qwen2.5:14b at :11434'],
          open_questions: [],
        }),
    })
    expect(note.quality).toBe('ok')
    const dep = await deployDistilledNotes([note], join(root, 'distilled'))
    expect(dep.ok).toBe(1)
    expect(dep.written).toHaveLength(1)
    const body = await readFile(dep.written[0], 'utf8')
    expect(body).toMatch(/distilled_via: pomnia-brain-core/)
    expect(body).toMatch(/quality: ok/)
  })

  it('job processOne dry-run does not write', async () => {
    const job = createDistillJob(() => ({
      enabled: true,
      model: 'qwen2.5:14b',
      ollamaUrl: 'http://127.0.0.1:9',
      vaultRoot: root,
      writable: true,
      readOnlyFlag: false,
    }))
    const r = await job.processOne(sampleConv(), {
      dryRun: true,
      generate: async () =>
        JSON.stringify({
          summary: 'x',
          decisions: ['use npm test in packages/brain-core'],
          solutions: ['mock generate'],
          facts: ['path C:/Users/Admin/Projects/pomnia-dev'],
          open_questions: [],
        }),
    })
    expect(r.note?.quality).toBe('ok')
    expect(r.written).toBeUndefined()
  })
})
