import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readCursorAgentTranscripts } from './cursor.js'

const dirs: string[] = []

afterEach(async () => {
  // Best-effort cleanup not required for CI temp; keep tests hermetic via unique homes.
  dirs.length = 0
})

describe('cursor agent-transcripts', () => {
  it('counts parent sessions and skips subagents', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pomnia-cursor-'))
    dirs.push(home)
    const sid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const sess = join(home, '.cursor', 'projects', 'demo-proj', 'agent-transcripts', sid)
    await mkdir(join(sess, 'subagents'), { recursive: true })
    await writeFile(
      join(sess, `${sid}.jsonl`),
      [
        JSON.stringify({
          role: 'user',
          message: { content: [{ type: 'text', text: 'Hello from parent' }] }
        }),
        JSON.stringify({
          role: 'assistant',
          message: { content: [{ type: 'text', text: 'Hi back' }] }
        })
      ].join('\n'),
      'utf8'
    )
    await writeFile(
      join(sess, 'subagents', 'ffffffff-1111-2222-3333-444444444444.jsonl'),
      JSON.stringify({
        role: 'user',
        message: { content: [{ type: 'text', text: 'subagent only' }] }
      }) + '\n',
      'utf8'
    )

    const convs = await readCursorAgentTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].id).toBe(sid)
    expect(convs[0].messages).toHaveLength(2)
    expect(convs[0].title).toContain('Hello')
  })
})
