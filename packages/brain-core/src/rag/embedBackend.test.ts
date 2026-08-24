import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EmbedClient, applyEmbedPrefix, parseEmbedBackend } from './embed.js'
import { loadConfig } from '../config/index.js'

describe('parseEmbedBackend', () => {
  it('defaults empty to ollama (desktop)', () => {
    expect(parseEmbedBackend(undefined)).toBe('ollama')
    expect(parseEmbedBackend('')).toBe('ollama')
  })

  it('accepts fastembed aliases', () => {
    expect(parseEmbedBackend('fastembed')).toBe('fastembed')
    expect(parseEmbedBackend('ONNX')).toBe('fastembed')
    expect(parseEmbedBackend('local')).toBe('fastembed')
  })

  it('accepts EMBED_PROVIDER=local via loadConfig', async () => {
    const cfg = await loadConfig(['--data-dir', '/tmp/pomnia-cfg-embed-prov'], {
      EMBED_PROVIDER: 'local',
    } as NodeJS.ProcessEnv)
    expect(cfg.embedBackend).toBe('fastembed')
  })

  it('rejects unknown names', () => {
    expect(() => parseEmbedBackend('openai')).toThrow(/unknown embed backend/)
  })
})

describe('applyEmbedPrefix', () => {
  it('keeps the exact nomic task prefixes', () => {
    expect(applyEmbedPrefix('note', 'document')).toBe('search_document: note')
    expect(applyEmbedPrefix('q', 'query')).toBe('search_query: q')
  })
})

describe('BRAIN_EMBED_BACKEND', () => {
  const base = ['--data-dir', '/tmp/pomnia-cfg-embed']
  let errors: string[] = []

  beforeEach(() => {
    errors = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a.map(String).join(' '))
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('selects fastembed from the environment', async () => {
    const cfg = await loadConfig([...base], {
      BRAIN_EMBED_BACKEND: 'fastembed',
    } as NodeJS.ProcessEnv)
    expect(cfg.embedBackend).toBe('fastembed')
    expect(cfg.embedCacheDir.replace(/\\/g, '/')).toBe('/tmp/pomnia-cfg-embed/embed-cache')
  })

  it('does not refuse a bad Ollama URL when using fastembed', async () => {
    const cfg = await loadConfig(
      [...base, '--embed-backend', 'fastembed', '--ollama-url', 'http://169.254.169.254'],
      {},
    )
    expect(cfg.embedBackend).toBe('fastembed')
    expect(cfg.ollamaUrlError).toBeUndefined()
    expect(errors.join('\n')).not.toMatch(/REFUSED Ollama URL/)
  })

  it('builds a fastembed client without an Ollama URL', () => {
    const c = new EmbedClient({
      backend: 'fastembed',
      embedModel: 'nomic-embed-text',
      cacheDir: '/tmp/pomnia-embed-cache-test',
    })
    expect(c.backend).toBe('fastembed')
    expect(c.config.modelId).toBe('nomic-ai/nomic-embed-text-v1.5')
  })
})
