// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ephemeral profile preview — gather USER.md + identity-relevant notes,
 * summarize WHO the user is (not session dumps / trading filler), and allow
 * manual Save of USER.md back into the open portable vault.
 */

import { existsSync, promises as fs } from 'node:fs'
import { join } from 'node:path'
import { GARBAGE_THRESHOLD } from '@core/brain/distill.js'
import { Ollama, defaultOllamaConfig } from '@core/brain/ollama.js'
import { loadIndex, searchIndex } from '@core/brain/localIndex.js'
import { log } from '@core/log.js'
import { brainCore } from './brainCore.js'
import { brainVaultDistilledDir, brainVaultRoot, getOpenEncryptedVaultPath } from './brainPaths.js'
import { resolveOllamaUrl } from './ollamaSettings.js'

export type ProfilePreviewStatus = 'ok' | 'vault_locked' | 'brain_down' | 'no_knowledge'

export interface ProfilePreviewResult {
  status: ProfilePreviewStatus
  /** Short PL identity summary when status === 'ok' */
  summary?: string
  /** How the summary was produced */
  source?: 'ollama' | 'fallback'
  /** Raw vault USER.md for editing (when vault is open). */
  userMd?: string
}

export type ProfilePreviewSaveResult =
  | { ok: true; path: string; chars: number }
  | { ok: false; error: 'vault_locked' | 'too_long' | 'write_failed'; detail?: string; maxChars?: number }

const USER_MD = 'USER.md'
/** Same ceiling as Hermes / MCP memory tool. */
export const USER_MAX_CHARS = 2200
const MAX_SNIPPET_CHARS = 380
const MAX_NOTES = 6
const OLLAMA_TIMEOUT_MS = 22_000

const EMPTY_USER_MD_STARTER = `# Preferred language: auto (PL+EN OK)
# memory: trwałe wzorce osoby (decyzje, threat, irytanty, tempo) — nie changelogi/ship notes.
# operacyjny brief agenta → vault/AGENTS.md (poza limitem 2200).

§ PROFIL
· Imię / nick:
· Czym się zajmujesz:
· Tempo decyzji / potrzeba kontroli:
· Motywacja / threat model:
· Irytanty:

§ TECH
· Projekty (tożsamość, nie release notes):

§ KOMUNIKACJA
· Język / ton:
· Brief operacyjny: vault/AGENTS.md
`

/** Sections that describe the person — not session changelog. */
const IDENTITY_SECTIONS = new Set(['PROFIL', 'KOMUNIKACJA', 'USER', 'PROFILE', 'COMM'])

/** Same spirit as distill GARBAGE_THRESHOLD — low-quality notes skip profiler pass. */
export const PROFILE_QUALITY_MIN = GARBAGE_THRESHOLD

const NOISE_NOTE_RE =
  /\b(pine\s*script|tradingview|atr\s*stop|heikin|renko|rsi\b|macd|futures|long\/short|take\s*profit|stop\s*loss|strategy\.|indicator\(|plot\()\b/i

/** Ship / changelog / one-off tech dumps — never feed profiler. */
const SHIP_NOTE_RE =
  /\b(next\s*ship|pack:win|installer|\.exe\b|changelog|release\s*notes?|backlog\s*~|0\.\d+\.\d+(?:-setup)?|JSDoc\s*fix|build\s*fix)\b/i

const IDENTITY_HIT_RE =
  /\b(preferenc|profil|kim jest|decyzj|threat|MIT|ownership|irytant|glow|tempo|kontrola|motywac|wartości|partner|brutal|prawda|quality|paste-rate|garbage|product-owner|brief\s*agenta)\b/i

const IDENTITY_SEARCH_QUERIES = [
  'kim jestem profil użytkownika preferencje wartości',
  'decyzje tempo kontroli ownership product-owner',
  'threat MIT wrapper fear leak portable memory',
  'partner intelektualny brutal prawda przyjemność brief agenta',
  'irytanty glow Liquid Glass Cursor baza garbage distill opaque Brain',
  'stack język programowania narzędzia Windows Pomnia',
]

/** Parse YAML-ish frontmatter quality fields from a distilled note. */
export function parseNoteQuality(raw: string): {
  quality?: string
  qualityScore?: number
  body: string
} {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { body: raw }
  const fm = m[1] ?? ''
  const body = m[2] ?? ''
  const q = fm.match(/^quality:\s*(\S+)/m)?.[1]
  const qsRaw = fm.match(/^quality_score:\s*([0-9.]+)/m)?.[1]
  const qualityScore = qsRaw != null && qsRaw !== '' ? Number(qsRaw) : undefined
  return {
    quality: q,
    qualityScore: Number.isFinite(qualityScore) ? qualityScore : undefined,
    body,
  }
}

/** True when note is below distill bar or explicitly marked garbage/stub. */
export function isLowQualityNote(raw: string): boolean {
  const { quality, qualityScore } = parseNoteQuality(raw)
  if (quality === 'garbage' || quality === 'stub') return true
  if (qualityScore != null && qualityScore < PROFILE_QUALITY_MIN) return true
  return false
}

async function readUserMd(vaultRoot: string): Promise<string> {
  const p = join(vaultRoot, USER_MD)
  if (!existsSync(p)) return ''
  try {
    const raw = await fs.readFile(p, 'utf8')
    return raw.slice(0, USER_MAX_CHARS)
  } catch {
    return ''
  }
}

function userMdPath(vaultRoot: string): string {
  return join(vaultRoot, USER_MD)
}

/**
 * Write editor contents to `<openVault>/USER.md`. Refuses when no encrypted
 * vault is open (avoids AppData orphan writes).
 */
export async function saveProfileUserMd(content: string): Promise<ProfilePreviewSaveResult> {
  if (!getOpenEncryptedVaultPath()) {
    return { ok: false, error: 'vault_locked' }
  }
  const text = content.replace(/\r\n/g, '\n')
  if (text.length > USER_MAX_CHARS) {
    return {
      ok: false,
      error: 'too_long',
      detail: `${text.length}`,
      maxChars: USER_MAX_CHARS,
    }
  }
  const vaultRoot = brainVaultRoot()
  const path = userMdPath(vaultRoot)
  const tmp = `${path}.tmp`
  try {
    await fs.writeFile(tmp, text, 'utf8')
    await fs.rename(tmp, path)
  } catch (e) {
    try {
      if (existsSync(tmp)) await fs.unlink(tmp)
    } catch {
      /* ignore */
    }
    log.warn('profile preview save USER.md failed:', (e as Error).message)
    return { ok: false, error: 'write_failed', detail: (e as Error).message }
  }
  return { ok: true, path, chars: text.length }
}

function parseUserSections(userMd: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  if (!userMd.trim()) return map
  const blocks = userMd.split(/\n(?=§\s)/)
  for (const block of blocks) {
    const t = block.trim()
    if (!t.startsWith('§')) continue
    const lines = t.split('\n')
    const header = (lines[0] ?? '').replace(/^§\s*/, '').trim().toUpperCase()
    const body = lines
      .slice(1)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          !l.startsWith('#') &&
          !/^·\s*(Imię|Czym się|Stack|Preferencje|Projekty|Tempo|Motywacja|Irytanty|Język|Brief).*:?\s*$/i.test(
            l,
          ),
      )
    if (header) map.set(header, body)
  }
  return map
}

/** True when § PROFIL (or alias) has real content, not empty placeholders. */
export function hasIdentityProfile(userMd: string): boolean {
  const sections = parseUserSections(userMd)
  for (const key of IDENTITY_SECTIONS) {
    const body = sections.get(key)
    if (body && body.length > 0) return true
  }
  return false
}

export function isNoiseNote(title: string, text: string): boolean {
  const blob = `${title}\n${text}`
  if (NOISE_NOTE_RE.test(blob)) return true
  if (SHIP_NOTE_RE.test(blob)) return true
  // Parameter dumps / open-question CTAs from bad distill
  if ((blob.match(/\n-\s+/g) || []).length >= 8 && blob.length > 500) return true
  if (/Czy chciałbyś|Would you like|Open Questions/i.test(blob) && blob.length < 800) return true
  return false
}

/** Score identity signal for profiler selection (higher = keep). */
export function scoreIdentitySignal(title: string, text: string, qualityScore?: number): number {
  const blob = `${title}\n${text}`
  let score = 1
  if (IDENTITY_HIT_RE.test(blob)) score += 4
  if (/\b(decyzj|threat|irytant|tempo|ownership|kontrola|motywac)\b/i.test(blob)) score += 3
  if (/\b(Pomnia|Brain|vault|MCP)\b/i.test(blob) && !SHIP_NOTE_RE.test(blob)) score += 1
  if (SHIP_NOTE_RE.test(blob)) score -= 5
  if (NOISE_NOTE_RE.test(blob)) score -= 5
  if (qualityScore != null) {
    if (qualityScore >= PROFILE_QUALITY_MIN) score += Math.min(3, (qualityScore - PROFILE_QUALITY_MIN) * 0.6)
    else score -= 4
  }
  return score
}

async function readDistilledSnippets(vaultRoot: string): Promise<{ title: string; text: string; score: number }[]> {
  const dir = brainVaultDistilledDir(vaultRoot)
  if (!existsSync(dir)) return []
  let names: string[]
  try {
    names = (await fs.readdir(dir)).filter((f) => f.endsWith('.md') || f.endsWith('.txt'))
  } catch {
    return []
  }
  const withStat = await Promise.all(
    names.map(async (name) => {
      const full = join(dir, name)
      try {
        const st = await fs.stat(full)
        return { name, full, mtime: st.mtimeMs }
      } catch {
        return null
      }
    }),
  )
  const sorted = withStat
    .filter((x): x is { name: string; full: string; mtime: number } => !!x)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 24)

  const out: { title: string; text: string; score: number }[] = []
  for (const f of sorted) {
    try {
      const raw = (await fs.readFile(f.full, 'utf8')).trim()
      if (!raw) continue
      // Bridge distill quality → profiler: skip garbage/stub / score < threshold
      if (isLowQualityNote(raw)) continue
      const { qualityScore, body } = parseNoteQuality(raw)
      const title = f.name.replace(/\.(md|txt)$/i, '')
      const text = (body || raw).slice(0, MAX_SNIPPET_CHARS)
      if (isNoiseNote(title, text)) continue
      const score = scoreIdentitySignal(title, text, qualityScore)
      if (score < 2) continue // require identity signal, not residual ship/tech
      out.push({ title, text, score })
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, MAX_NOTES)
}

function structuredFallback(userMd: string, notes: { title: string; text: string }[]): string {
  const sections = parseUserSections(userMd)
  const lines: string[] = []

  const profil = sections.get('PROFIL') || sections.get('USER') || sections.get('PROFILE')
  const kom = sections.get('KOMUNIKACJA') || sections.get('COMM')
  const tech = sections.get('TECH')

  if (profil?.length) {
    lines.push('Profil (wzorce osoby):')
    for (const b of profil.slice(0, 8)) lines.push(`· ${b.replace(/^·\s*/, '')}`)
  } else {
    lines.push(
      'Za mało o Tobie w § PROFIL — dopisz kim jesteś, tempo/kontrola, threat model, irytanty, potem Zapisz.',
    )
  }

  if (kom?.length) {
    lines.push('')
    lines.push('Jak z Tobą pracować:')
    for (const b of kom.slice(0, 5)) lines.push(`· ${b.replace(/^·\s*/, '')}`)
  }

  if (tech?.length) {
    lines.push('')
    lines.push('Kontekst pracy (TECH):')
    // Only first 3 durable-looking lines — skip long ship changelogs
    const short = tech.filter((t) => t.length < 180).slice(0, 3)
    for (const b of short.length ? short : tech.slice(0, 2)) {
      lines.push(`· ${b.replace(/^·\s*/, '').slice(0, 160)}`)
    }
  }

  const usefulNotes = notes.filter((n) => !isNoiseNote(n.title, n.text)).slice(0, 2)
  if (usefulNotes.length && profil?.length) {
    lines.push('')
    lines.push('Z notatek (sygnały):')
    for (const n of usefulNotes) {
      const oneLine = n.text.replace(/\s+/g, ' ').trim().slice(0, 120)
      lines.push(`· ${oneLine}${oneLine.length >= 120 ? '…' : ''}`)
    }
  }

  return lines.join('\n').trim()
}

function looksLikeGarbageSummary(text: string): boolean {
  if (!text || text.length < 20) return true
  if (NOISE_NOTE_RE.test(text)) return true
  if (/^(Oto|Here is|Based on|Na podstawie poniższych)/i.test(text) && text.length > 400) return true
  // Model dumping TOOL lists or MCP chatter
  if (/\b(search_library|save_conversation|get_user_profile)\b/i.test(text)) return true
  // Release-notes / ship dump disguised as a profile
  if (SHIP_NOTE_RE.test(text)) return true
  if ((text.match(/\b(theme|dashboard|pipeline|handshake|locale)\b/gi) || []).length >= 4) return true
  return false
}

async function summarizeWithOllama(
  userMd: string,
  notes: { title: string; text: string }[],
  ollamaUrl: string,
): Promise<string | null> {
  const client = new Ollama({
    ...defaultOllamaConfig(),
    baseUrl: ollamaUrl,
  })
  try {
    if (!(await client.reachable())) return null
  } catch {
    return null
  }

  const sections = parseUserSections(userMd)
  const identityParts: string[] = []
  for (const key of ['PROFIL', 'KOMUNIKACJA', 'USER', 'PROFILE', 'COMM']) {
    const body = sections.get(key)
    if (body?.length) identityParts.push(`§ ${key}\n${body.join('\n')}`)
  }
  const tech = sections.get('TECH')
  const techBrief = tech?.filter((t) => t.length < 160).slice(0, 4).join('\n') || ''

  const notesBlock = notes
    .filter((n) => !isNoiseNote(n.title, n.text))
    .slice(0, 4)
    .map((n, i) => `[${i + 1}] ${n.title}\n${n.text}`)
    .join('\n\n')
    .slice(0, 2200)

  const hasPerson = identityParts.length > 0

  const prompt = [
    '=== FAKTY O OSOBIE (USER.md) ===',
    identityParts.join('\n\n') || '(brak § PROFIL / KOMUNIKACJA — nie wymyślaj osoby)',
    '',
    '=== KONTEKST PRACY (skrót TECH, opcjonalnie) ===',
    techBrief || '(brak)',
    '',
    '=== NOTATKI (tylko sygnały tożsamości; ignoruj trading/Pine) ===',
    notesBlock || '(brak)',
    '',
    hasPerson
      ? [
          'Napisz profil psychologiczny TEJ OSOBY po polsku (5–8 punktów „·”) — jak profiler: tylko wzorce obserwowalne z faktów.',
          'Wymagane kąty (jeśli widać w źródłach): kim jest; tempo decyzji/kontrola; threat model (czego unika); motywacja; irytanty; jak briefować agenta.',
          'Zakaz: MBTI/DSM, wymyślona trauma, release notes, ścieżki instalatora, listy parametrów, Pine/trading filler, meta o MCP/toolach.',
          'Ton: ostry, konkretny, partnerski — wzorce zachowania, nie CV.',
        ].join(' ')
      : 'Nie ma § PROFIL. Odpowiedz DOKŁADNIE w tym stylu (po polsku):\n· Za mało danych o Tobie — uzupełnij § PROFIL (kim jesteś, tempo/kontrola, threat, irytanty, brief agenta) i naciśnij Zapisz.\n· Ewentualnie 1 zdanie co widać w TECH (projekt), bez zgadywania imienia ani biografii.',
  ].join('\n')

  try {
    const text = await client.generate(prompt, {
      system:
        'Jesteś profilerem behawioralnym Pomni (styl FBI profiler): opisujesz OSOBĘ przez obserwowalne wzorce — decyzje, threat model, motywacja, irytanty, jak z nią pracować. NIE jesteś changelogiem produktu. Zero MBTI/DSM/wymyślonej traumy. Brak faktów o osobie → każ uzupełnić § PROFIL. Nigdy nie zmyślaj. PL, punkty „·”.',
      temperature: 0.15,
      timeoutMs: OLLAMA_TIMEOUT_MS,
    })
    const cleaned = text.trim()
    if (!cleaned || looksLikeGarbageSummary(cleaned)) return null
    return cleaned
  } catch (e) {
    log.warn('profile preview ollama summarize failed:', (e as Error).message)
    return null
  }
}

/**
 * Build profile preview for the floating panel. Always returns `userMd` when a
 * vault is open so the UI can edit + Save even if summary/notes are empty.
 */
export type ProfileProgressPhase = 'user_md' | 'notes' | 'search' | 'summarize' | 'done'

export async function buildProfilePreview(opts?: {
  brainIndexFile?: string
  onProgress?: (phase: ProfileProgressPhase, pct: number) => void
}): Promise<ProfilePreviewResult> {
  const progress = (phase: ProfileProgressPhase, pct: number) => {
    try {
      opts?.onProgress?.(phase, pct)
    } catch {
      /* ignore */
    }
  }

  if (!getOpenEncryptedVaultPath()) {
    return { status: 'vault_locked' }
  }

  progress('user_md', 8)
  const vaultRoot = brainVaultRoot()
  const userMdRaw = await readUserMd(vaultRoot)
  const userMd = userMdRaw || EMPTY_USER_MD_STARTER

  progress('notes', 22)
  let notes = await readDistilledSnippets(vaultRoot)

  const brainRunning = brainCore.status().running
  const ollamaUrl = resolveOllamaUrl()

  if (opts?.brainIndexFile && existsSync(opts.brainIndexFile)) {
    progress('search', 40)
    try {
      const idx = await loadIndex(opts.brainIndexFile)
      if (idx.entries?.length) {
        const client = new Ollama({
          ...defaultOllamaConfig(),
          baseUrl: ollamaUrl,
        })
        if (await client.reachable()) {
          const seen = new Set(notes.map((n) => n.title))
          for (const q of IDENTITY_SEARCH_QUERIES) {
            const hits = await searchIndex(idx, q, client, 4)
            for (const h of hits) {
              const title = h.notePath?.split(/[/\\]/).pop()?.replace(/\.md$/i, '') || 'nota'
              const text = (h.text || '').slice(0, MAX_SNIPPET_CHARS)
              if (isNoiseNote(title, text)) continue
              if (isLowQualityNote(text) || isLowQualityNote(`${title}\n${text}`)) continue
              if (seen.has(title)) continue
              const hitScore = scoreIdentitySignal(title, text) + 3 // index hit bonus
              if (hitScore < 2) continue
              notes.push({ title, text, score: hitScore })
              seen.add(title)
            }
          }
          notes = notes.sort((a, b) => b.score - a.score).slice(0, MAX_NOTES)
        }
      }
    } catch (e) {
      log.warn('profile preview index search:', (e as Error).message)
    }
  }

  const hasKnowledge = !!(userMdRaw || notes.length)
  if (!hasKnowledge) {
    progress('done', 100)
    if (!brainRunning) return { status: 'brain_down', userMd }
    return { status: 'no_knowledge', userMd }
  }

  progress('summarize', 62)
  // If USER.md exists but only as empty starter / TECH dump — still summarize,
  // but Ollama/fallback will push the user to fill § PROFIL.
  const ollamaSummary = await summarizeWithOllama(userMdRaw, notes, ollamaUrl)
  if (ollamaSummary) {
    progress('done', 100)
    return { status: 'ok', summary: ollamaSummary, source: 'ollama', userMd }
  }

  progress('summarize', 88)
  const fallback = structuredFallback(userMdRaw, notes)
  progress('done', 100)
  if (!fallback) {
    if (!brainRunning) return { status: 'brain_down', userMd }
    return { status: 'no_knowledge', userMd }
  }
  return { status: 'ok', summary: fallback, source: 'fallback', userMd }
}
