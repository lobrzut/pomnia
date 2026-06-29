import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseExportBuffer } from '../import/archives.js'

describe('import/archives', () => {
  it('parses a Claude.ai export zip (conversations.json)', () => {
    const data = [
      {
        uuid: 'c1',
        name: 'WireGuard killswitch',
        created_at: '2026-01-05T10:00:00Z',
        chat_messages: [
          { sender: 'human', text: 'how to killswitch?' },
          { sender: 'assistant', text: 'routing-mark + blackhole route' }
        ]
      }
    ]
    const zip = zipSync({ 'conversations.json': strToU8(JSON.stringify(data)) })
    const r = parseExportBuffer(zip, 'claude.zip')
    expect(r.conversations.length).toBe(1)
    expect(r.conversations[0].source).toBe('claude-ai')
    expect(r.conversations[0].messages.length).toBe(2)
    expect(r.conversations[0].messages[0].role).toBe('user')
    expect(r.perSource['claude-ai']).toBe(1)
  })

  it('parses a ChatGPT export (mapping tree, ordered by create_time)', () => {
    const data = [
      {
        title: 'Trading',
        mapping: {
          n2: { message: { author: { role: 'assistant' }, content: { parts: ['second'] }, create_time: 2 } },
          n1: { message: { author: { role: 'user' }, content: { parts: ['first'] }, create_time: 1 } },
          sys: { message: { author: { role: 'system' }, content: { parts: ['ignore me'] }, create_time: 0 } }
        }
      }
    ]
    const r = parseExportBuffer(strToU8(JSON.stringify(data)), 'chatgpt-export.json')
    expect(r.conversations[0].source).toBe('chatgpt')
    const texts = r.conversations[0].messages.map((m) => m.text)
    expect(texts).toEqual(['first', 'second']) // system dropped, ordered
  })

  it('parses generic JSONL into one conversation', () => {
    const jsonl = [
      JSON.stringify({ role: 'user', text: 'q1' }),
      JSON.stringify({ role: 'assistant', text: 'a1' }),
      'garbage line',
      JSON.stringify({ role: 'user', content: 'q2' })
    ].join('\n')
    const r = parseExportBuffer(strToU8(jsonl), 'session.jsonl')
    expect(r.conversations.length).toBe(1)
    expect(r.conversations[0].messages.length).toBe(3)
  })
})
