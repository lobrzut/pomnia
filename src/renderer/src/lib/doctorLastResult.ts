// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Persist the last manual doctor run so Dashboard can surface FAIL without re-running.
 *
 * A verdict is evidence about a moment, not a permanent property of the install.
 * A FAIL recorded during a bad upgrade used to stick to the badge forever: every
 * live probe on the card went green, the badge stayed red, and nothing but a
 * manual re-run could clear it. So a stored verdict is dropped once it stops
 * describing what is running — a different build, or simply too long ago.
 */

import { loadStr, saveStr } from './persist'

export const DOCTOR_LAST_RESULT_KEY = 'pomnia.doctor.lastResult'

/** Past this, the verdict describes a machine that may no longer exist. */
export const DOCTOR_RESULT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export interface DoctorLastResult {
  ok: number
  warn: number
  fail: number
  /** True when fail > 0 (or exitCode === 1). */
  hasFail: boolean
  /** ISO timestamp of last manual run. */
  at: string
  /** Build identity the run observed. Every record written from 0.1.71 has one. */
  build?: string
}

/**
 * @param currentBuild identity of the running build; when given, a verdict from
 *   a different build is discarded rather than shown.
 */
export function loadDoctorLastResult(currentBuild?: string): DoctorLastResult | null {
  const raw = loadStr(DOCTOR_LAST_RESULT_KEY)
  if (!raw) return null
  let parsed: Partial<DoctorLastResult>
  try {
    parsed = JSON.parse(raw) as Partial<DoctorLastResult>
  } catch {
    return null
  }
  if (
    typeof parsed.ok !== 'number' ||
    typeof parsed.warn !== 'number' ||
    typeof parsed.fail !== 'number' ||
    typeof parsed.hasFail !== 'boolean' ||
    typeof parsed.at !== 'string'
  ) {
    return null
  }

  const age = Date.now() - Date.parse(parsed.at)
  // NaN (unparseable timestamp) fails this comparison, so it is treated as fresh
  // rather than silently dropped; the build check below still applies.
  if (age > DOCTOR_RESULT_MAX_AGE_MS) {
    clearDoctorLastResult()
    return null
  }
  // No stamp means the record predates 0.1.71 — written by a build that could not
  // stamp, i.e. an older one. That is exactly what we discard, so an unstamped
  // record is dropped without needing to know what is running now.
  if (!parsed.build || (currentBuild && parsed.build !== currentBuild)) {
    clearDoctorLastResult()
    return null
  }

  return {
    ok: parsed.ok,
    warn: parsed.warn,
    fail: parsed.fail,
    hasFail: parsed.hasFail,
    at: parsed.at,
    ...(typeof parsed.build === 'string' ? { build: parsed.build } : {}),
  }
}

export function saveDoctorLastResult(result: DoctorLastResult): void {
  saveStr(DOCTOR_LAST_RESULT_KEY, JSON.stringify(result))
}

export function clearDoctorLastResult(): void {
  saveStr(DOCTOR_LAST_RESULT_KEY, '')
}
