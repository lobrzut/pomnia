import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import {
  classifyImportConversations,
  conversationFingerprint,
  parseExportBuffer,
  parseGeminiActivity,
} from '../import/archives.js'
import type { Conversation } from '../model.js'

describe('import/archives', () => {
  it('parses a Claude.ai export zip (conversations.json)', () => {
    const data = [
      {
        uuid: 'c1',
        name: 'WireGuard killswitch',
        created_at: '2026-01-05T10:00:00Z',
        project_uuid: 'proj-1',
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
    expect(r.conversations[0].project).toBe('proj-1')
    expect(r.perSource['claude-ai']).toBe(1)
  })

  it('skips Claude sidecar users.json so zip does not invent Generic', () => {
    const conversations = [
      {
        uuid: 'c1',
        name: 'Real chat',
        chat_messages: [
          { sender: 'human', text: 'hi' },
          { sender: 'assistant', text: 'hello' }
        ]
      }
    ]
    // Fake "conversation-shaped" users.json that would become Generic if parsed.
    const users = [
      {
        uuid: 'u1',
        name: 'Account meta',
        messages: [{ role: 'user', text: 'should not import' }]
      }
    ]
    const zip = zipSync({
      'conversations.json': strToU8(JSON.stringify(conversations)),
      'users.json': strToU8(JSON.stringify(users)),
      'projects.json': strToU8(JSON.stringify([{ uuid: 'p1', name: 'Proj' }]))
    })
    const r = parseExportBuffer(zip, 'data-2026-01-01-export.zip')
    expect(r.conversations.length).toBe(1)
    expect(r.conversations[0].source).toBe('claude-ai')
    expect(r.perSource.generic ?? 0).toBe(0)
  })

  it('reads Claude message body from content[] when text is empty', () => {
    const data = [
      {
        uuid: 'c2',
        name: 'Content blocks',
        chat_messages: [
          { sender: 'human', text: '', content: [{ type: 'text', text: 'from content' }] },
          { sender: 'assistant', text: '', content: [{ type: 'text', text: 'reply' }] }
        ]
      }
    ]
    const r = parseExportBuffer(strToU8(JSON.stringify(data)), 'claude-export.json')
    expect(r.conversations[0].messages.map((m) => m.text)).toEqual(['from content', 'reply'])
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

  it('parses Gemini Takeout MyActivity.json (details variant) grouped by chat id', () => {
    const activity = [
      {
        header: 'Gemini Apps',
        title: 'Used Gemini Apps',
        titleUrl: 'https://gemini.google.com/app/c/abc123',
        time: '2026-01-02T10:00:00.000Z',
        products: ['Gemini Apps'],
        details: [
          { name: 'Request', value: 'wireguard tips' },
          { name: 'Response', value: 'use AllowedIPs' }
        ]
      },
      {
        header: 'Gemini Apps',
        title: 'Used Gemini Apps',
        titleUrl: 'https://gemini.google.com/app/c/abc123',
        time: '2026-01-02T10:01:00.000Z',
        products: ['Gemini Apps'],
        details: [
          { name: 'Request', value: 'and killswitch?' },
          { name: 'Response', value: 'blackhole route' }
        ]
      },
      {
        header: 'Gemini Apps',
        titleUrl: 'https://gemini.google.com/app/c/other',
        time: '2026-01-03T09:00:00.000Z',
        products: ['Gemini Apps'],
        details: [{ name: 'Request', value: 'solo prompt' }]
      }
    ]
    const zip = zipSync({
      'Takeout/My Activity/Gemini Apps/MyActivity.json': strToU8(JSON.stringify(activity))
    })
    const r = parseExportBuffer(zip, 'takeout.zip')
    expect(r.conversations.length).toBe(2)
    expect(r.perSource.gemini).toBe(2)
    const main = r.conversations.find((c) => c.id === 'abc123')!
    expect(main.source).toBe('gemini')
    expect(main.messages.length).toBe(4)
    expect(main.messages[0].text).toBe('wireguard tips')
  })

  it('parseGeminiActivity handles userInteractions request/response blobs', () => {
    const out = parseGeminiActivity([
      {
        header: 'Gemini',
        titleUrl: 'https://gemini.google.com/app/c/ui1',
        time: '2026-02-01T12:00:00.000Z',
        products: ['Gemini Apps'],
        userInteractions: [
          {
            userInteraction: {
              request: JSON.stringify([{ text: 'hello gemini' }]),
              response: JSON.stringify([{ text: 'hi there' }])
            }
          }
        ]
      }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('ui1')
    expect(out[0].messages.map((m) => m.text)).toEqual(['hello gemini', 'hi there'])
  })

  it('same export parsed twice yields identical ids including .md/.txt/.jsonl', () => {
    const claude = [
      {
        uuid: 'stable-uuid',
        name: 'Chat',
        chat_messages: [
          { sender: 'human', text: 'hi' },
          { sender: 'assistant', text: 'hello' },
        ],
      },
    ]
    const jsonl = [
      JSON.stringify({ role: 'user', text: 'q1' }),
      JSON.stringify({ role: 'assistant', text: 'a1' }),
    ].join('\n')
    const md = '# note\ncontent here'
    const txt = 'plain text body'

    const a = [
      ...parseExportBuffer(strToU8(JSON.stringify(claude)), 'claude.json').conversations,
      ...parseExportBuffer(strToU8(jsonl), 'session.jsonl').conversations,
      ...parseExportBuffer(strToU8(md), 'note.md').conversations,
      ...parseExportBuffer(strToU8(txt), 'note.txt').conversations,
    ]
    const b = [
      ...parseExportBuffer(strToU8(JSON.stringify(claude)), 'claude.json').conversations,
      ...parseExportBuffer(strToU8(jsonl), 'session.jsonl').conversations,
      ...parseExportBuffer(strToU8(md), 'note.md').conversations,
      ...parseExportBuffer(strToU8(txt), 'note.txt').conversations,
    ]
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id))
    expect(a.every((c) => c.id.length > 0)).toBe(true)
    expect(a.find((c) => c.source === 'generic' && c.title === 'note.md')!.id).toMatch(/^imp-[0-9a-f]{32}$/)
    expect(a.find((c) => c.title === 'session.jsonl')!.id).toMatch(/^imp-[0-9a-f]{32}$/)
  })

  it('.md with added message gets a different contentId', () => {
    const v1 = parseExportBuffer(strToU8('hello'), 'note.md').conversations[0]
    const v2 = parseExportBuffer(strToU8('hello\n\nmore'), 'note.md').conversations[0]
    expect(v1.id).not.toBe(v2.id)
    expect(v1.id).toMatch(/^imp-/)
    expect(v2.id).toMatch(/^imp-/)
  })

  it('classify: same set twice → added 0, updated 0, skipped N', () => {
    const data = [
      {
        uuid: 'c1',
        name: 'One',
        chat_messages: [
          { sender: 'human', text: 'a' },
          { sender: 'assistant', text: 'b' },
        ],
      },
      {
        uuid: 'c2',
        name: 'Two',
        chat_messages: [
          { sender: 'human', text: 'c' },
          { sender: 'assistant', text: 'd' },
        ],
      },
    ]
    const convs = parseExportBuffer(strToU8(JSON.stringify(data)), 'claude.json').conversations
    const existing = new Map(convs.map((c) => [c.id, conversationFingerprint(c)]))
    const r = classifyImportConversations(convs, existing)
    expect(r).toEqual({ toWrite: [], added: 0, updated: 0, skipped: 2 })
  })

  it('classify: grown chat → updated 1 and toWrite has new message text', () => {
    const base: Conversation = {
      id: 'uuid-grow',
      source: 'claude-ai',
      title: 'Growing',
      messages: [
        { role: 'user', text: 'first' },
        { role: 'assistant', text: 'reply' },
      ],
    }
    const grown: Conversation = {
      ...base,
      messages: [
        ...base.messages,
        { role: 'user', text: 'follow-up with NEW_MARKER_TEXT' },
        { role: 'assistant', text: 'more' },
      ],
    }
    const existing = new Map([[base.id, conversationFingerprint(base)]])
    const r = classifyImportConversations([grown], existing)
    expect(r.added).toBe(0)
    expect(r.updated).toBe(1)
    expect(r.skipped).toBe(0)
    expect(r.toWrite).toHaveLength(1)
    expect(r.toWrite[0].messages.some((m) => m.text.includes('NEW_MARKER_TEXT'))).toBe(true)
  })
})
