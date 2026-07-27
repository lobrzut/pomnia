// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** UI chrome language only — Brain knowledge stays auto bilingual (PL+EN). */

export type UiLocale = 'pl' | 'en'

export const UI_LOCALES: readonly UiLocale[] = ['pl', 'en'] as const

let current: UiLocale = 'pl'

export function isUiLocale(v: unknown): v is UiLocale {
  return v === 'pl' || v === 'en'
}

export function getUiLocale(): UiLocale {
  return current
}

/** Called by the store when hydrating / changing Settings → Język interfejsu. */
export function setUiLocaleCache(locale: UiLocale): void {
  current = isUiLocale(locale) ? locale : 'pl'
}
