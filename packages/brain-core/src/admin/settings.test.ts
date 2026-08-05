import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  readSettings,
  settingsPath,
  validateEmbedModel,
  validateOllamaUrl,
  writeSettings,
} from './settings.js'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-settings-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const rejected = (u: string): string => {
  const v = validateOllamaUrl(u)
  expect(v.ok, `expected ${JSON.stringify(u)} to be REJECTED`).toBe(false)
  return (v as { reason: string }).reason
}

describe('validateOllamaUrl', () => {
  it('accepts the addresses people actually use', () => {
    expect(validateOllamaUrl('http://127.0.0.1:11434')).toEqual({ ok: true, url: 'http://127.0.0.1:11434' })
    expect(validateOllamaUrl('http://192.168.1.201:11434')).toEqual({ ok: true, url: 'http://192.168.1.201:11434' })
    expect(validateOllamaUrl('https://ollama.example.com')).toEqual({ ok: true, url: 'https://ollama.example.com' })
    expect(validateOllamaUrl('  http://localhost:11434/  ')).toEqual({ ok: true, url: 'http://localhost:11434' })
  })

  /**
   * The reason this function exists. A settings field the server fetches from
   * is an SSRF primitive; on a VPS this address returns cloud credentials.
   */
  it('refuses cloud metadata and link-local addresses', () => {
    expect(rejected('http://169.254.169.254/')).toBe('link-local')
    expect(rejected('http://169.254.169.254:80')).toBe('link-local')
    expect(rejected('http://metadata.google.internal')).toBe('link-local')
    expect(rejected('http://metadata')).toBe('link-local')
    expect(rejected('http://foo.internal')).toBe('link-local')
    expect(rejected('http://[fe80::1]:11434')).toBe('link-local')
  })

  it('refuses schemes that would read files or sockets', () => {
    expect(rejected('file:///etc/passwd')).toBe('bad-scheme')
    expect(rejected('unix:///var/run/docker.sock')).toBe('bad-scheme')
    expect(rejected('gopher://x')).toBe('bad-scheme')
  })

  /** Credentials in a URL end up in every error message and every log line. */
  it('refuses embedded credentials', () => {
    expect(rejected('http://user:pass@ollama:11434')).toBe('has-credentials')
  })

  it('refuses a path, which the client would silently mangle', () => {
    expect(rejected('http://127.0.0.1:11434/api')).toBe('has-path')
  })

  it('refuses nonsense', () => {
    expect(rejected('')).toBe('empty')
    expect(rejected('   ')).toBe('empty')
    expect(rejected('not a url')).toBe('not-a-url')
    expect(rejected('11434')).toBe('not-a-url')
  })

  /** A right address whose service is down is still the right address. */
  it('does not require the host to be reachable', () => {
    expect(validateOllamaUrl('http://192.0.2.1:11434').ok).toBe(true)
  })
})

describe('validateEmbedModel', () => {
  it('accepts real model names', () => {
    for (const m of ['nomic-embed-text', 'nomic-embed-text:v1.5', 'library/model_2']) {
      expect(validateEmbedModel(m).ok, m).toBe(true)
    }
  })

  it('refuses shell-ish and empty input', () => {
    for (const m of ['', '  ', 'a; rm -rf /', 'a b', 'a$(id)', 'x'.repeat(200)]) {
      expect(validateEmbedModel(m).ok, m).toBe(false)
    }
  })
})

describe('settings file', () => {
  it('round-trips', async () => {
    await writeSettings(dir, {
      schemaVersion: 1,
      ollamaUrl: 'http://127.0.0.1:11434',
      embedModel: 'nomic-embed-text',
      updatedAt: '2026-08-05T12:00:00.000Z',
      updatedBy: 'laptop',
    })
    const s = await readSettings(dir)
    expect(s.ollamaUrl).toBe('http://127.0.0.1:11434')
    expect(s.updatedBy).toBe('laptop')
  })

  it('is written 0600 — it records who changed what', async () => {
    await writeSettings(dir, { schemaVersion: 1, ollamaUrl: 'http://x:1' })
    const { mode } = await import('node:fs').then((m) => m.promises.stat(settingsPath(dir)))
      .then((st) => ({ mode: st.mode & 0o777 }))
    // Windows does not implement POSIX modes; assert only where it means something.
    if (process.platform !== 'win32') expect(mode).toBe(0o600)
  })

  /** A corrupt settings file must not brick a working server. */
  it('falls back to defaults on garbage rather than throwing', async () => {
    await writeFile(settingsPath(dir), '{ not json', 'utf8')
    expect(await readSettings(dir)).toEqual({ schemaVersion: 1 })
  })

  it('treats an absent file as "nothing overrides the unit"', async () => {
    expect(await readSettings(dir)).toEqual({ schemaVersion: 1 })
  })

  it('ignores fields of the wrong type instead of adopting them', async () => {
    await writeFile(settingsPath(dir), JSON.stringify({ ollamaUrl: 42, embedModel: null }), 'utf8')
    const s = await readSettings(dir)
    expect(s.ollamaUrl).toBeUndefined()
    expect(s.embedModel).toBeUndefined()
  })

  it('leaves no temp file behind', async () => {
    await writeSettings(dir, { schemaVersion: 1 })
    await expect(readFile(`${settingsPath(dir)}.tmp`, 'utf8')).rejects.toThrow()
  })
})
