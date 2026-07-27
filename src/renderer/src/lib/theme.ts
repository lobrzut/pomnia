// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** App color schemes — persisted in app-settings, applied via html[data-theme]. */
export type ColorScheme = 'mint' | 'iris' | 'glass'

export const COLOR_SCHEMES: readonly ColorScheme[] = ['mint', 'iris', 'glass'] as const

export function isColorScheme(v: unknown): v is ColorScheme {
  return v === 'mint' || v === 'iris' || v === 'glass'
}

/** Apply theme to the document so main + floating windows share one CSS bundle. */
export function applyColorScheme(scheme: ColorScheme): void {
  const next = isColorScheme(scheme) ? scheme : 'mint'
  document.documentElement.dataset.theme = next
}
