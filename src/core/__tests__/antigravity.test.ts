import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { antigravityProfileRoots } from '../locations.js'
import {
  antigravityAdapter,
  collectAntigravityGeminiFiles,
  probeAntigravity,
  readAntigravityTranscripts
} from '../adapters/antigravity.js'

const sessionId = '378dc290-360d-48bf-8f0c-f68d4444152e'

function userLine(text: string): string {
  return JSON.stringify({
    step_index: 0,
    source: 'USER_EXPLICIT',
    type: 'USER_INPUT',
    status: 'DONE',
    created_at: '2026-06-28T15:30:08Z',
    content: `<USER_REQUEST>\n${text}\n</USER_REQUEST>`
  })
}

function assistantLine(text: string): string {
  return JSON.stringify({
    step_index: 1,
    source: 'MODEL',
    type: 'PLANNER_RESPONSE',
    status: 'DONE',
    created_at: '2026-06-28T15:30:12Z',
    content: text
  })
}

async function writeTranscript(home: string, relDir: string, body: string, file = 'transcript.jsonl') {
  const logDir = path.join(home, ...relDir.split('/'), sessionId, '.system_generated', 'logs')
  await fs.mkdir(logDir, { recursive: true })
  await fs.writeFile(path.join(logDir, file), body, 'utf8')
}

describe('antigravity adapter', () => {
  it('parses Cascade transcript.jsonl into conversations', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-'))
    await writeTranscript(
      home,
      '.gemini/antigravity/brain',
      [userLine('Czy Cursor jest na Macu?'), assistantLine('Tak, Cursor działa na macOS.')].join('\n')
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].source).toBe('antigravity')
    expect(convs[0].id).toBe(sessionId)
    expect(convs[0].title).toContain('Cursor')
    expect(convs[0].messages.length).toBeGreaterThanOrEqual(2)
    expect(convs[0].messages[0].role).toBe('user')
    expect(convs[0].messages.some((m) => m.role === 'assistant' && m.text.includes('macOS'))).toBe(true)
    expect(convs[0].meta?.surface).toBe('legacy')
  })

  it('reads a current IDE install that has no legacy ~/.gemini/antigravity tree', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-ide-'))
    await writeTranscript(
      home,
      '.gemini/antigravity-ide/brain',
      [userLine('IDE only'), assistantLine('from antigravity-ide')].join('\n')
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].messages.some((m) => m.text.includes('antigravity-ide'))).toBe(true)
    expect(convs[0].meta?.surface).toBe('ide')
  })

  it('prefers transcript_full.jsonl over the short transcript.jsonl', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-full-'))
    const rel = '.gemini/antigravity-ide/brain'
    await writeTranscript(home, rel, [userLine('short log'), assistantLine('TRUNCATED')].join('\n'))
    await writeTranscript(
      home,
      rel,
      [userLine('short log'), assistantLine('COMPLETE ANSWER from the full log')].join('\n'),
      'transcript_full.jsonl'
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].messages.some((m) => m.text.includes('COMPLETE ANSWER'))).toBe(true)
    expect(convs[0].messages.some((m) => m.text.includes('TRUNCATED'))).toBe(false)
  })

  it('falls back to transcript.jsonl when transcript_full.jsonl has no messages', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-empty-full-'))
    const rel = '.gemini/antigravity-cli/brain'
    await writeTranscript(
      home,
      rel,
      JSON.stringify({ source: 'SYSTEM', type: 'CONVERSATION_HISTORY', status: 'DONE' }),
      'transcript_full.jsonl'
    )
    await writeTranscript(home, rel, [userLine('kept'), assistantLine('from the short log')].join('\n'))

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].meta?.surface).toBe('cli')
    expect(convs[0].messages.some((m) => m.text.includes('short log'))).toBe(true)
  })

  it('keeps the richer copy when the same session id was migrated across surfaces', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-dedupe-'))
    await writeTranscript(home, '.gemini/antigravity/brain', userLine('only the old copy'))
    await writeTranscript(
      home,
      '.gemini/antigravity-ide/brain',
      [userLine('only the old copy'), assistantLine('continued in the IDE')].join('\n')
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].messages).toHaveLength(2)
    expect(convs[0].meta?.surface).toBe('ide')
  })

  it('reads the Linux CLI brain under ~/.antigravity-cli', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-linux-cli-'))
    await writeTranscript(
      home,
      '.antigravity-cli/brain',
      [userLine('linux cli'), assistantLine('agy')].join('\n')
    )

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(1)
    expect(convs[0].messages[0].text).toContain('linux cli')
  })

  it('snapshots the IDE gemini tree, not only the legacy folder', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-files-'))
    await writeTranscript(
      home,
      '.gemini/antigravity-ide/brain',
      [userLine('file'), assistantLine('captured')].join('\n')
    )

    const files = await collectAntigravityGeminiFiles(home, { sources: ['antigravity'] })
    const rels = files.map((f) => f.relPath)
    expect(rels.some((r) => r.includes('gemini/antigravity-ide/brain/') && r.endsWith('transcript.jsonl'))).toBe(
      true
    )
    expect(rels.some((r) => r.startsWith('gemini/antigravity/'))).toBe(false)
  })

  it('does not invent chats from a conversations directory that has only a sqlite db', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-db-'))
    const dir = path.join(home, '.gemini', 'antigravity-ide', 'conversations')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `${sessionId}.db`), 'not a transcript', 'utf8')

    const convs = await readAntigravityTranscripts(home)
    expect(convs).toHaveLength(0)
  })
})

describe('antigravity profile roots', () => {
  it('names the current IDE folder and the pre-rename folder', () => {
    const win = antigravityProfileRoots('win32', 'C:\\Users\\ada').map((p) => p.replace(/\\/g, '/'))
    expect(win[0]).toBe('C:/Users/ada/AppData/Roaming/Antigravity IDE')
    expect(win[1]).toBe('C:/Users/ada/AppData/Roaming/Antigravity')

    expect(antigravityProfileRoots('darwin', '/Users/ada')[0]).toBe(
      '/Users/ada/Library/Application Support/Antigravity IDE'
    )
    expect(antigravityProfileRoots('linux', '/home/ada')[0]).toBe('/home/ada/.config/Antigravity IDE')
  })
})

describe('antigravity resolveRoot', () => {
  it('prefers the current IDE profile when that folder exists', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-root-'))
    const ide = path.join(home, '.config', 'Antigravity IDE')
    await fs.mkdir(ide, { recursive: true })
    await fs.mkdir(path.join(home, '.config', 'Antigravity'), { recursive: true })
    expect(antigravityAdapter.resolveRoot('linux', home)).toBe(ide)
  })

  it('uses a brain directory when no IDE profile exists', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-root-brain-'))
    const brain = path.join(home, '.gemini', 'antigravity-ide', 'brain')
    await fs.mkdir(brain, { recursive: true })
    expect(antigravityAdapter.resolveRoot('linux', home)).toBe(brain)
  })

  it('falls back to the older profile name when nothing is installed', () => {
    const home = path.join(os.tmpdir(), 'pomnia-ag-missing-' + process.pid)
    expect(antigravityAdapter.resolveRoot('linux', home)).toBe(path.join(home, '.config', 'Antigravity'))
  })
})

describe('antigravity probe', () => {
  it('counts an IDE-only install whose legacy profile folder is absent', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-probe-'))
    await fs.mkdir(path.join(home, '.config', 'Antigravity IDE', 'User'), { recursive: true })
    await writeTranscript(
      home,
      '.gemini/antigravity-ide/brain',
      [userLine('visible'), assistantLine('yes')].join('\n')
    )

    const probe = await probeAntigravity('linux', home)
    expect(probe.installed).toBe(true)
    expect(probe.root).toBe(path.join(home, '.config', 'Antigravity IDE'))
    expect(probe.conversations).toHaveLength(1)
    expect(probe.surfaces).toEqual(['ide'])
  })

  it('is installed when only a brain directory exists (CLI, no IDE profile)', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-probe-cli-'))
    await writeTranscript(home, '.gemini/antigravity-cli/brain', userLine('cli only'))

    const probe = await probeAntigravity('linux', home)
    expect(probe.installed).toBe(true)
    expect(probe.conversations).toHaveLength(1)
    expect(probe.root).toBe(path.join(home, '.gemini', 'antigravity-cli', 'brain'))
  })

  it('is not installed when neither a profile nor a brain directory exists', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pomnia-ag-probe-empty-'))
    const probe = await probeAntigravity('linux', home)
    expect(probe.installed).toBe(false)
    expect(probe.conversations).toHaveLength(0)
  })
})
