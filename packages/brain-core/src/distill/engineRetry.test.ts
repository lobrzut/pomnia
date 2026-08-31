import { describe, expect, it } from 'vitest'

import { distillConversation } from './engine.js'
import type { DistillConversation } from './types.js'

const conv: DistillConversation = {
  id: 'c1',
  source: 'cursor',
  title: 'Wazuh install',
  messages: [
    { role: 'user', text: 'Zainstaluj Wazuh 4.14 na 192.168.1.201 przez apt.' },
    { role: 'assistant', text: 'Zrobione, alerty w /var/ossec/logs/alerts/alerts.json.' },
    { role: 'user', text: 'dpkg -l | grep wazuh nie przeszlo przez fail2ban.' },
  ],
}

const GOOD = JSON.stringify({
  title: 'Wazuh 4.14',
  summary: 'Zainstalowano Wazuh 4.14.',
  decisions: ['Pin Wazuh to 4.14'],
  solutions: ['apt install wazuh-manager'],
  facts: ['alerts at /var/ossec/logs/alerts/alerts.json'],
  open_questions: [],
  attempts_failed: ['dpkg -l blocked by fail2ban'],
})

/** The real failure: valid JSON opens, then a repetition loop, never closed. */
const COLLAPSED = '{"title": "Go Go Go",\n"facts": ["/brutal" \t] \n' + '\t'.repeat(40)

function scripted(responses: string[]): {
  generate: (p: string, s: string, m: string) => Promise<string>
  calls: () => number
} {
  let i = 0
  return {
    generate: async () => responses[Math.min(i++, responses.length - 1)],
    calls: () => i,
  }
}

describe('distillConversation — one retry when nothing usable came back', () => {
  it('retries once and keeps the note that a repetition loop would have lost', async () => {
    const s = scripted([COLLAPSED, GOOD])
    const note = await distillConversation(conv, { ollamaUrl: '', generate: s.generate })
    expect(s.calls()).toBe(2)
    expect(note.fields.decisions).toContain('Pin Wazuh to 4.14')
    expect(note.fields.attemptsFailed.length).toBe(1)
  })

  it('does not spend a second call when the first answer is usable', async () => {
    const s = scripted([GOOD])
    await distillConversation(conv, { ollamaUrl: '', generate: s.generate })
    expect(s.calls()).toBe(1)
  })

  it('gives up after one retry — a queue that never yields is worse than a lost note', async () => {
    const s = scripted([COLLAPSED, COLLAPSED, GOOD])
    const note = await distillConversation(conv, { ollamaUrl: '', generate: s.generate })
    expect(s.calls()).toBe(2)
    expect(note.fields.decisions).toEqual([])
  })

  it('treats a conversation with nothing durable as empty, at the cost of one retry', async () => {
    // The prompt tells the model to return empty arrays when there is nothing
    // worth keeping, and that is indistinguishable from a collapse at this
    // layer. Paying one generation for it is the accepted price.
    const empty = JSON.stringify({
      title: '', summary: '', decisions: [], solutions: [],
      facts: [], open_questions: [], attempts_failed: [],
    })
    const s = scripted([empty, empty])
    const note = await distillConversation(conv, { ollamaUrl: '', generate: s.generate })
    expect(s.calls()).toBe(2)
    expect(note.fields.facts).toEqual([])
  })
})
