// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Phase names for the pipeline / activity ids — shared by main IPC and renderer.
 *
 * These reach the screen during every backup and every distillation, so they
 * are among the first words a new user reads. They lived in Polish only, which
 * made the English UI Polish exactly where it is busiest.
 *
 * The locale arrives as an argument rather than being read here: this module is
 * imported by the main process, which has no renderer store to ask.
 */
export type PipelineLocale = 'pl' | 'en'

const PHASES: Record<string, { pl: string; en: string }> = {
  distill: { pl: 'destylacja', en: 'distilling' },
  encrypt: { pl: 'szyfrowanie', en: 'encrypting' },
  index: { pl: 'indeksowanie', en: 'indexing' },
  embed: { pl: 'embeddingi', en: 'embedding' },
  'brain-start': { pl: 'uruchamianie Brain', en: 'starting Brain' },
  'doc-import': { pl: 'import dokumentu', en: 'importing document' },
  parse: { pl: 'parsowanie', en: 'parsing' },
  ocr: { pl: 'OCR', en: 'OCR' },
  deploy: { pl: 'wdrożenie', en: 'deploying' },
  collect: { pl: 'zbieranie', en: 'collecting' },
  reindex: { pl: 'odświeżanie indeksu', en: 'refreshing index' },
  start: { pl: 'start', en: 'starting' },
}

/** Kept for callers that only ever wanted the Polish map. */
export const PIPELINE_PHASE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PHASES).map(([k, v]) => [k, v.pl]),
)

export function pipelinePhaseLabel(phase: string, locale: PipelineLocale = 'pl'): string {
  // An unknown phase falls through as its own id rather than as a blank: a
  // progress line reading "· 3/40" tells you nothing about what is running.
  return PHASES[phase]?.[locale] ?? phase
}

function truncateDetail(s: string, max = 40): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function formatPipelineProgressLabel(
  phase: string,
  detail?: string,
  locale: PipelineLocale = 'pl',
): string {
  const name = pipelinePhaseLabel(phase, locale)
  return detail ? `${name} · ${truncateDetail(detail)}` : name
}

export type PipelineProgressPayload = {
  phase: string
  done: number
  total: number
  detail?: string
}

export function localizePipelineProgress<T extends PipelineProgressPayload>(
  e: T,
  locale: PipelineLocale = 'pl',
): T & { label: string } {
  return { ...e, label: formatPipelineProgressLabel(e.phase, e.detail, locale) }
}
