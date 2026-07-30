// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Persist last manual doctor run so Dashboard can surface FAIL without re-running. */

import { loadStr, saveStr } from './persist'

export const DOCTOR_LAST_RESULT_KEY = 'pomnia.doctor.lastResult'

export interface DoctorLastResult {
  ok: number
  warn: number
  fail: number
  /** True when fail > 0 (or exitCode === 1). */
  hasFail: boolean
  /** ISO timestamp of last manual run. */
  at: string
}

export function loadDoctorLastResult(): DoctorLastResult | null {
  const raw = loadStr(DOCTOR_LAST_RESULT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DoctorLastResult>
    if (
      typeof parsed.ok !== 'number' ||
      typeof parsed.warn !== 'number' ||
      typeof parsed.fail !== 'number' ||
      typeof parsed.hasFail !== 'boolean' ||
      typeof parsed.at !== 'string'
    ) {
      return null
    }
    return {
      ok: parsed.ok,
      warn: parsed.warn,
      fail: parsed.fail,
      hasFail: parsed.hasFail,
      at: parsed.at,
    }
  } catch {
    return null
  }
}

export function saveDoctorLastResult(result: DoctorLastResult): void {
  saveStr(DOCTOR_LAST_RESULT_KEY, JSON.stringify(result))
}

export function clearDoctorLastResult(): void {
  saveStr(DOCTOR_LAST_RESULT_KEY, '')
}
