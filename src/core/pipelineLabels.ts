/** Polish labels for pipeline / activity phase ids — shared by main IPC and renderer. */

export const PIPELINE_PHASE_LABELS: Record<string, string> = {
  distill: 'destylacja',
  encrypt: 'szyfrowanie',
  index: 'indeksowanie',
  embed: 'embeddingi',
  'brain-start': 'uruchamianie Brain',
  'doc-import': 'import dokumentu',
  parse: 'parsowanie',
  deploy: 'wdrożenie',
  collect: 'zbieranie',
  reindex: 'odświeżanie indeksu',
  start: 'start',
}

export function pipelinePhaseLabel(phase: string): string {
  return PIPELINE_PHASE_LABELS[phase] ?? phase
}

function truncateDetail(s: string, max = 40): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function formatPipelineProgressLabel(phase: string, detail?: string): string {
  const pl = pipelinePhaseLabel(phase)
  return detail ? `${pl} · ${truncateDetail(detail)}` : pl
}

export type PipelineProgressPayload = {
  phase: string
  done: number
  total: number
  detail?: string
}

export function localizePipelineProgress<T extends PipelineProgressPayload>(
  e: T,
): T & { label: string } {
  return { ...e, label: formatPipelineProgressLabel(e.phase, e.detail) }
}
