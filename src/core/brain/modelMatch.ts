// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ollama model-tag matching. Deliberately dependency-free so the renderer can
 * import it without dragging the logger (and node:fs behind it) into the bundle.
 *
 * Canonical copy: this lived in four places (doctor, Settings, Onboarding,
 * Brain) that had drifted apart on case handling.
 */

/**
 * Is `want` among the installed model tags?
 *
 * `nomic-embed-text` matches `nomic-embed-text:latest` — Ollama reports the
 * explicit tag while users type the bare name. Case-insensitive: tags are
 * lowercase by convention, nothing enforces it.
 */
export function hasOllamaModel(models: string[], want: string): boolean {
  const w = want.trim().toLowerCase()
  if (!w) return false
  return models.some((m) => {
    const ml = m.trim().toLowerCase()
    return ml === w || ml === `${w}:latest` || ml.replace(/:latest$/, '') === w
  })
}
