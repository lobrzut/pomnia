import type { SourceId } from './types'

export function humanBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const m = Math.round(diff / 60000)
  if (m < 1) return 'przed chwilą'
  if (m < 60) return `${m} min temu`
  const h = Math.round(m / 60)
  if (h < 24) return h === 1 ? '1 godz. temu' : `${h} godz. temu`
  const d = Math.round(h / 24)
  if (d < 30) return d === 1 ? '1 dzień temu' : `${d} dni temu`
  return new Date(iso).toLocaleDateString('pl-PL')
}

export interface SourceMeta {
  label: string
  color: string
  glyph: string // short monogram for the icon tile
}

export const SOURCE_META: Record<string, SourceMeta> = {
  'claude-code': { label: 'Claude Code', color: '#d97757', glyph: 'CC' },
  'claude-desktop': { label: 'Claude Desktop', color: '#d97757', glyph: 'C' },
  cursor: { label: 'Cursor', color: '#22d3ee', glyph: 'Cu' },
  antigravity: { label: 'Antigravity', color: '#4285f4', glyph: 'Ag' },
  vscode: { label: 'VS Code', color: '#3b9eff', glyph: 'VS' },
  windsurf: { label: 'Windsurf', color: '#22d3ee', glyph: 'Wf' },
  continue: { label: 'Continue', color: '#34d399', glyph: 'Co' },
  'claude-ai': { label: 'Claude.ai', color: '#d97757', glyph: 'Cl' },
  chatgpt: { label: 'ChatGPT', color: '#10a37f', glyph: 'GPT' },
  grok: { label: 'Grok', color: '#e2e8f0', glyph: 'Gr' },
  gemini: { label: 'Gemini', color: '#4285f4', glyph: 'Ge' },
  generic: { label: 'Generic', color: '#9aa3bd', glyph: '··' }
}

export function sourceMeta(id: SourceId | string): SourceMeta {
  return SOURCE_META[id] ?? SOURCE_META.generic
}

/** Shorten filesystem paths for compact UI strips. */
export function shortPath(p: string, max = 36): string {
  if (!p) return '—'
  const norm = p.replace(/\\/g, '/')
  if (norm.length <= max) return norm
  const parts = norm.split('/').filter(Boolean)
  if (parts.length >= 2) {
    const tail = parts.slice(-2).join('/')
    if (tail.length <= max - 1) return `…/${tail}`
  }
  return `…${norm.slice(-max + 1)}`
}
