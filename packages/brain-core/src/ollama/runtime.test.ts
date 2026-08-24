// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { classifyOllamaPs } from './runtime.js'

describe('classifyOllamaPs', () => {
  it('reports idle when nothing is loaded', () => {
    const s = classifyOllamaPs([])
    expect(s.accelerator).toBe('idle')
    expect(s.reachable).toBe(true)
    expect(s.summary).toMatch(/no model loaded/)
  })

  it('reports gpu when size_vram > 0', () => {
    const s = classifyOllamaPs([
      { name: 'nomic-embed-text:latest', size: 595_142_656, size_vram: 595_142_656 },
    ])
    expect(s.accelerator).toBe('gpu')
    expect(s.summary).toMatch(/GPU/)
    expect(s.running[0]?.name).toBe('nomic-embed-text:latest')
  })

  it('reports cpu when loaded with size_vram 0', () => {
    const s = classifyOllamaPs([{ name: 'qwen2.5:14b', size: 8_000_000_000, size_vram: 0 }])
    expect(s.accelerator).toBe('cpu')
    expect(s.summary).toMatch(/CPU/)
  })
})
