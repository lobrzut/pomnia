// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { beforeEach, describe, expect, it } from 'vitest'

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

const {
  DOCTOR_LAST_RESULT_KEY,
  DOCTOR_RESULT_MAX_AGE_MS,
  loadDoctorLastResult,
  saveDoctorLastResult,
} = await import('./doctorLastResult')

const BUILD = '0.1.71 · abc1234 · 2026-08-25 12:42'

function write(over: Record<string, unknown> = {}) {
  store.set(
    DOCTOR_LAST_RESULT_KEY,
    JSON.stringify({
      ok: 6,
      warn: 0,
      fail: 1,
      hasFail: true,
      at: new Date().toISOString(),
      build: BUILD,
      ...over,
    }),
  )
}

describe('doctorLastResult', () => {
  beforeEach(() => store.clear())

  it('returns a fresh verdict from the same build', () => {
    write()
    expect(loadDoctorLastResult(BUILD)?.hasFail).toBe(true)
  })

  it('drops a FAIL recorded by a different build', () => {
    write({ build: '0.1.69 · dead000 · 2026-08-01 10:00' })
    expect(loadDoctorLastResult(BUILD)).toBeNull()
    // and does not linger for the next reader, whatever the build then is
    expect(loadDoctorLastResult()).toBeNull()
  })

  it('drops a verdict older than the age cap', () => {
    write({ at: new Date(Date.now() - DOCTOR_RESULT_MAX_AGE_MS - 60_000).toISOString() })
    expect(loadDoctorLastResult(BUILD)).toBeNull()
  })

  it('keeps a verdict recorded just inside the age cap', () => {
    write({ at: new Date(Date.now() - DOCTOR_RESULT_MAX_AGE_MS + 60_000).toISOString() })
    expect(loadDoctorLastResult(BUILD)?.hasFail).toBe(true)
  })

  it('drops a pre-0.1.71 record that carries no build stamp', () => {
    write({ build: undefined })
    expect(loadDoctorLastResult(BUILD)).toBeNull()
  })

  it('drops an unstamped record even when the running build is unknown', () => {
    write({ build: undefined })
    expect(loadDoctorLastResult()).toBeNull()
  })

  it('round-trips the build stamp through save', () => {
    saveDoctorLastResult({ ok: 7, warn: 0, fail: 0, hasFail: false, at: new Date().toISOString(), build: BUILD })
    expect(loadDoctorLastResult(BUILD)?.build).toBe(BUILD)
  })
})
