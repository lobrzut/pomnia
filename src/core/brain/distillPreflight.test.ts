// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  assessDistillPreflight,
  formatDistillPreflightBlock,
  OLLAMA_DOWNLOAD_URL,
} from './distillPreflight.js'

const base = {
  distillModel: 'llama3.1:8b',
  embedModel: 'nomic-embed-text',
  requireEmbed: true,
  ollamaUrl: 'http://127.0.0.1:11434',
}

describe('assessDistillPreflight', () => {
  it('lists Ollama, the embed model and the distill model when the daemon is down', () => {
    const report = assessDistillPreflight({ ...base, reachable: false, models: [] })
    expect(report.ok).toBe(false)
    expect(report.items.map((item) => item.id)).toEqual(['ollama', 'embed', 'distill'])
    expect(report.items.every((item) => !item.ok)).toBe(true)
    const text = formatDistillPreflightBlock(report)
    expect(text).toContain(OLLAMA_DOWNLOAD_URL)
    expect(text).toContain('ollama pull nomic-embed-text')
    expect(text).toContain('ollama pull llama3.1:8b')
    expect(text).toContain('4.7 GB')
    expect(text).not.toContain('qwen2.5:14b')
  })

  it('does not send a LAN URL to the local installer', () => {
    const report = assessDistillPreflight({
      ...base,
      reachable: false,
      models: [],
      ollamaUrl: 'http://192.168.1.201:11434',
      requireEmbed: false,
    })
    const ollama = report.items.find((item) => item.id === 'ollama')
    expect(ollama && ollama.id === 'ollama' && ollama.local).toBe(false)
    expect(report.items.some((item) => item.id === 'embed')).toBe(false)
    const text = formatDistillPreflightBlock(report)
    expect(text).not.toContain('ollama.com')
    expect(text).toContain('192.168.1.201:11434')
    expect(text).toContain('ollama pull llama3.1:8b')
  })

  it('passes when Ollama is up and the required models are installed', () => {
    const report = assessDistillPreflight({
      ...base,
      reachable: true,
      models: ['llama3.1:8b:latest', 'nomic-embed-text:latest'],
    })
    expect(report.ok).toBe(true)
  })

  it('blocks on a missing distill model even when embeddings are present', () => {
    const report = assessDistillPreflight({
      ...base,
      reachable: true,
      models: ['nomic-embed-text'],
    })
    expect(report.ok).toBe(false)
    expect(report.items.find((item) => item.id === 'embed')?.ok).toBe(true)
    expect(report.items.find((item) => item.id === 'distill')?.ok).toBe(false)
  })

  it('does not require the embed model for a remote brain', () => {
    const report = assessDistillPreflight({
      ...base,
      reachable: true,
      models: ['llama3.1:8b'],
      requireEmbed: false,
    })
    expect(report.ok).toBe(true)
  })
})
