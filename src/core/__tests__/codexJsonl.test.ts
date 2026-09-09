import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseCodexRollout, parseCodexTree } from '../adapters/codexJsonl.js'
import { descriptorFor } from '../locations.js'

/**
 * Codex rollouts, shaped from what 19 real sessions (26,913 lines) contain.
 *
 * Every case below pins a decision that a plausible-looking parser gets wrong:
 * the duplicate `event_msg` stream, the encrypted reasoning blob, the harness
 * talking to itself through a user turn, and a credential file sitting one
 * directory above the transcripts.
 */

let root: string

/** One line of a rollout, in the envelope Codex actually writes. */
function line(type: string, payload: unknown, timestamp = '2026-09-06T10:03:50.760Z'): string {
  return JSON.stringify({ timestamp, type, payload })
}

const META = line('session_meta', {
  session_id: '01a0762c-9c4b-7591-8019-2e66f84fd3e7',
  cwd: 'C:\\Users\\helluk\\Documents\\Codex\\linear-plugin',
  originator: 'Codex Desktop',
  cli_version: '0.153.4'
})

function say(role: string, text: string, kind = 'output_text'): string {
  return line('response_item', { type: 'message', role, content: [{ type: kind, text }] })
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'pomnia-codex-'))
  mkdirSync(join(root, 'sessions', '2026', '09', '06'), { recursive: true })
})

afterAll(() => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* the temp dir is the OS's problem after this */
  }
})

function rollout(name: string, lines: string[]): string {
  const file = join(root, 'sessions', '2026', '09', '06', name)
  writeFileSync(file, lines.join('\n') + '\n', 'utf8')
  return file
}

describe('parseCodexRollout', () => {
  it('reads a conversation and takes its identity from session_meta', async () => {
    const file = rollout('rollout-2026-09-06T12-03-50-aaa.jsonl', [
      META,
      say('user', 'Sprawdź przypisane zgłoszenia w Linear.', 'input_text'),
      say('assistant', 'Sprawdzę i zsyntetyzuję najnowsze zmiany.')
    ])

    const conv = await parseCodexRollout(file, 'codex')

    expect(conv).not.toBeNull()
    expect(conv!.id).toBe('01a0762c-9c4b-7591-8019-2e66f84fd3e7')
    expect(conv!.source).toBe('codex')
    expect(conv!.project).toContain('linear-plugin')
    expect(conv!.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(conv!.title).toContain('Linear')
  })

  it('ignores the event_msg stream that repeats every item', async () => {
    // 12,222 of the 26,913 measured lines are this. Counting them as content
    // would duplicate the entire conversation, silently and exactly once.
    const item = { type: 'item_completed', item: { text: 'Sprawdzę zgłoszenia.' } }
    const file = rollout('rollout-2026-09-06T12-03-50-bbb.jsonl', [
      META,
      say('assistant', 'Sprawdzę zgłoszenia.'),
      line('event_msg', item),
      line('event_msg', item)
    ])

    const conv = await parseCodexRollout(file, 'codex')

    expect(conv!.messages).toHaveLength(1)
  })

  it('never stores the encrypted reasoning blob, but keeps a plain summary', async () => {
    const file = rollout('rollout-2026-09-06T12-03-50-ccc.jsonl', [
      META,
      say('user', 'Zrób to.', 'input_text'),
      line('response_item', {
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Rozważam dwie ścieżki.' }],
        encrypted_content: 'gAAAAABqnTqNfb5wpu4N-x0FG3An6JvMy7hnYUuHGy4KGbsnRVlriPy4bBSlB7du'
      })
    ])

    const conv = await parseCodexRollout(file, 'codex')
    const all = conv!.messages.map((m) => m.text).join('\n')

    expect(all).toContain('Rozważam dwie ścieżki')
    expect(all).not.toContain('gAAAAAB')
  })

  it('drops the harness talking to itself', async () => {
    // `developer` is Codex briefing itself, and the plugin catalogue arrives
    // dressed as something the user typed. Neither is the user's memory.
    const file = rollout('rollout-2026-09-06T12-03-50-ddd.jsonl', [
      META,
      say('developer', '<app-context>\n# Codex desktop context\n- You are running…', 'input_text'),
      say('user', '<recommended_plugins>\nHere is a list of plugins…', 'input_text'),
      say('user', 'Napraw build.', 'input_text')
    ])

    const conv = await parseCodexRollout(file, 'codex')

    expect(conv!.messages).toHaveLength(1)
    expect(conv!.messages[0].text).toBe('Napraw build.')
  })

  it('unwraps a slash command instead of dropping or keeping the envelope', async () => {
    // Found only by running the parser over the real sessions: 14 turns wrap a
    // genuine briefing in <command-args>. Dropping them loses the briefing;
    // keeping the envelope makes it the conversation's title.
    const file = rollout('rollout-2026-09-06T12-03-50-ggg.jsonl', [
      META,
      say(
        'user',
        '<command-name>/remote-control</command-name>\n<command-message>remote-control</command-message>\n<command-args>Jesteś Michael, prowadzisz biuro. Zacznij od skrzynki.</command-args>',
        'input_text'
      )
    ])

    const conv = await parseCodexRollout(file, 'codex')

    expect(conv!.messages[0].text).toBe('Jesteś Michael, prowadzisz biuro. Zacznij od skrzynki.')
    expect(conv!.title).not.toContain('command-name')
  })

  it('returns null for a session where nothing was said', async () => {
    const file = rollout('rollout-2026-09-06T12-03-50-eee.jsonl', [META, line('turn_context', {})])
    expect(await parseCodexRollout(file, 'codex')).toBeNull()
  })

  it('prefers the model from turn_context, which session_meta does not carry', async () => {
    const file = rollout('rollout-2026-09-06T12-03-50-fff.jsonl', [
      META,
      line('turn_context', { model: 'gpt-5-codex', cwd: 'C:\\x' }),
      say('assistant', 'Gotowe.')
    ])

    const conv = await parseCodexRollout(file, 'codex')
    expect(conv!.meta?.model).toBe('gpt-5-codex')
  })
})

describe('parseCodexTree', () => {
  it('walks the dated tree and takes only rollouts', async () => {
    writeFileSync(join(root, 'sessions', 'notes.jsonl'), JSON.stringify({ type: 'x' }) + '\n')

    const all = await parseCodexTree(join(root, 'sessions'), 'codex')

    // Six of the seven fixtures hold a conversation; the empty one is skipped, and
    // notes.jsonl is not a rollout.
    expect(all.length).toBe(6)
    expect(all.every((c) => c.source === 'codex')).toBe(true)
  })

  it('returns nothing rather than throwing when Codex is not installed', async () => {
    expect(await parseCodexTree(join(root, 'nie-ma-takiego'), 'codex')).toEqual([])
  })
})

describe('codex source descriptor', () => {
  it('keeps auth.json out by omission, not by an option that can be turned off', () => {
    const d = descriptorFor('codex')!

    // `exclude` is dropped entirely when a backup runs with skipCaches: false.
    // `keepTop` is always applied, so the credential guard has to live there.
    expect(d.keepTop).toBeDefined()
    expect(d.keepTop).not.toContain('auth.json')
    expect(d.keepTop).toContain('sessions')
    expect(d.keepTop!.some((k) => /auth|token|credential/i.test(k))).toBe(false)
  })
})
