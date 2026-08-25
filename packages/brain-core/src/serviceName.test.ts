// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { SERVICE_NAME, SERVICE_ALIASES, isPomniaService } from './serviceName.js'

describe('recognising one of our own servers', () => {
  it('accepts the name currently emitted', () => {
    expect(isPomniaService(SERVICE_NAME)).toBe(true)
  })

  it('accepts the name the emitter will move to', () => {
    // Readers learn the new name a release before anything starts sending it,
    // so a mixed fleet never has a half that fails to recognise the other.
    expect(isPomniaService('pomnia')).toBe(true)
  })

  it('accepts every alias it claims to', () => {
    for (const a of SERVICE_ALIASES) expect(isPomniaService(a)).toBe(true)
  })

  it('ignores case and padding, because humans type these into probes', () => {
    expect(isPomniaService(' Brain-Core ')).toBe(true)
    expect(isPomniaService('POMNIA')).toBe(true)
  })

  it('refuses something else answering on the same port', () => {
    // The failure this guards: a proxy or an unrelated service replying 200 to
    // /healthz. Reachable is not the same as being the thing you wanted.
    expect(isPomniaService('caddy')).toBe(false)
    expect(isPomniaService('ollama')).toBe(false)
  })

  it('refuses a body with no service field at all', () => {
    expect(isPomniaService(undefined)).toBe(false)
    expect(isPomniaService(null)).toBe(false)
    expect(isPomniaService('')).toBe(false)
    expect(isPomniaService(42)).toBe(false)
  })
})
