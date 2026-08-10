import { describe, expect, it } from 'vitest'

import { identifyEngine } from './engine.js'

/**
 * Payloads captured live from 192.168.1.201 — the machine where the confusion
 * actually happened. Both ports answer, both look healthy, one is the wrong
 * brain over the wrong vault.
 */
const BRAIN_CORE_HEALTHZ = { ok: true, service: 'brain-core', auth: true }
const LEGACY_PROXY_HEALTHZ = { ok: true, upstream: 'http://127.0.0.1:7863', tokens: 4 }

describe('identifyEngine', () => {
  it('recognises brain-core', () => {
    const e = identifyEngine(BRAIN_CORE_HEALTHZ)
    expect(e.engine).toBe('brain-core')
    expect(e.compatible).toBe(true)
  })

  it('recognises the legacy Python auth proxy', () => {
    const e = identifyEngine(LEGACY_PROXY_HEALTHZ)
    expect(e.engine).toBe('legacy-python')
    expect(e.compatible).toBe(false)
  })

  /** `ok: true` is exactly what made the wrong target look right. */
  it('does not treat ok:true as evidence of anything', () => {
    expect(identifyEngine({ ok: true }).engine).toBe('unknown')
    expect(identifyEngine({ ok: true }).compatible).toBe(false)
  })

  it('treats a missing or non-JSON body as unknown, not as a pass', () => {
    expect(identifyEngine(undefined).engine).toBe('unknown')
    expect(identifyEngine(null).engine).toBe('unknown')
    expect(identifyEngine({}).engine).toBe('unknown')
  })

  /** The dashboard's /stats fallback: real JSON, no self-identification. */
  it('does not mistake a stats payload for an engine', () => {
    expect(identifyEngine({ notes: 1782, sessions: 49 }).engine).toBe('unknown')
  })

  it('never reports compatible for anything but brain-core', () => {
    for (const p of [LEGACY_PROXY_HEALTHZ, {}, { ok: true }, { service: 'something-else' }]) {
      expect(identifyEngine(p).compatible).toBe(false)
    }
  })
})
