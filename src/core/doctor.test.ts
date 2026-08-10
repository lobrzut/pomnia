// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'
import {
  analyzeIndexConsistency,
  buildOllamaDoctorCheck,
  findDuplicateSessionGroups,
  formatDoctorLines,
  normalizeDoctorPath,
} from './doctor.js'

describe('normalizeDoctorPath', () => {
  it('unifies backslash and slash', () => {
    expect(normalizeDoctorPath('C:\\Vault\\distilled\\a.md')).toBe(
      normalizeDoctorPath('C:/Vault/distilled/a.md'),
    )
  })
})

describe('findDuplicateSessionGroups', () => {
  it('detects one duplicate group for the same 8-char session suffix', () => {
    const groups = findDuplicateSessionGroups([
      'C:\\Vault\\distilled\\topic_ab12cd34.md',
      'C:\\Vault\\distilled\\_weak\\topic_ab12cd34.md',
      'C:\\Vault\\distilled\\other_ffffffff.md',
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.session8).toBe('ab12cd34')
    expect(groups[0]!.excess).toBe(1)
    expect(groups[0]!.paths).toHaveLength(2)
  })
})

describe('analyzeIndexConsistency', () => {
  it('detects dead entries for nonexistent indexed paths', () => {
    const r = analyzeIndexConsistency({
      vaultRoot: 'C:\\Vault',
      indexedPaths: ['C:\\Vault\\distilled\\gone_aaaaaaaa.md'],
      chunkPaths: [],
      diskIndexablePaths: [],
      fileExists: () => false,
    })
    expect(r.deadEntries).toHaveLength(1)
    expect(r.deadEntries[0]).toMatch(/gone_aaaaaaaa/)
  })

  it('FAIL signal: _review/ chunks counted', () => {
    const r = analyzeIndexConsistency({
      vaultRoot: 'C:\\Vault',
      indexedPaths: ['C:\\Vault\\distilled\\_review\\bad_bbbbbbbb.md'],
      chunkPaths: ['C:\\Vault\\distilled\\_review\\bad_bbbbbbbb.md'],
      chunkCounts: { 'C:\\Vault\\distilled\\_review\\bad_bbbbbbbb.md': 3 },
      diskIndexablePaths: [],
      fileExists: () => true,
    })
    expect(r.reviewChunkCount).toBe(3)
    expect(r.reviewIndexedFiles).toBeGreaterThan(0)
  })

  it('treats \\ and / paths for the same note as one', () => {
    const r = analyzeIndexConsistency({
      vaultRoot: 'C:\\Vault',
      indexedPaths: ['C:/Vault/distilled/note_cccccccc.md'],
      chunkPaths: ['C:/Vault/distilled/note_cccccccc.md'],
      chunkCounts: { 'C:/Vault/distilled/note_cccccccc.md': 2 },
      diskIndexablePaths: ['C:\\Vault\\distilled\\note_cccccccc.md'],
      fileExists: () => false,
    })
    expect(r.missingFromIndex).toHaveLength(0)
    expect(r.deadEntries).toHaveLength(0)
  })
})

describe('formatDoctorLines', () => {
  it('prefixes levels and ends with summary', () => {
    const lines = formatDoctorLines({
      checks: [
        { id: 'a', level: 'OK', message: 'build clean' },
        { id: 'b', level: 'WARN', message: 'dupes', action: 'run dedupe' },
      ],
      ok: 1,
      warn: 1,
      fail: 0,
      exitCode: 0,
      generatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(lines[0]).toBe('OK build clean')
    expect(lines[1]).toBe('WARN dupes — run dedupe')
    expect(lines.at(-1)).toBe('1 OK · 1 WARN · 0 FAIL')
  })
})

describe('buildOllamaDoctorCheck', () => {
  it('FAIL when embedded brain and Ollama unreachable', () => {
    const c = buildOllamaDoctorCheck({
      remoteBrain: false,
      reachable: false,
      baseUrl: 'http://127.0.0.1:11434',
      embedModel: 'nomic-embed-text',
      distillModel: 'qwen2.5:14b',
      models: [],
    })
    expect(c.level).toBe('FAIL')
  })

  it('WARN (not FAIL) when remote brain and Ollama unreachable', () => {
    const c = buildOllamaDoctorCheck({
      remoteBrain: true,
      reachable: false,
      baseUrl: 'http://192.168.1.201:11434',
      embedModel: 'nomic-embed-text',
      distillModel: 'qwen2.5:14b',
      models: [],
    })
    expect(c.level).toBe('WARN')
    expect(c.message).toMatch(/optional for remote/)
    expect(c.action).toMatch(/:11434/)
  })

  it('WARN missing embed when remote; FAIL when embedded', () => {
    const remote = buildOllamaDoctorCheck({
      remoteBrain: true,
      reachable: true,
      baseUrl: 'http://192.168.1.201:11434',
      embedModel: 'nomic-embed-text',
      distillModel: 'qwen2.5:14b',
      models: ['qwen2.5:14b'],
    })
    const local = buildOllamaDoctorCheck({
      remoteBrain: false,
      reachable: true,
      baseUrl: 'http://127.0.0.1:11434',
      embedModel: 'nomic-embed-text',
      distillModel: 'qwen2.5:14b',
      models: ['qwen2.5:14b'],
    })
    expect(remote.level).toBe('WARN')
    expect(local.level).toBe('FAIL')
  })
})
