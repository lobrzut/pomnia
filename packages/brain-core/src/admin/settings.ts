// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Server settings that survive a restart and can be changed without SSH.
 *
 * A self-hosted server whose only configuration lives in a systemd unit means
 * every "where is Ollama now" needs a text editor and a `daemon-reload`. These
 * are the few knobs that genuinely change after install; everything structural
 * (paths, port, read-only) stays in the unit, where an operator expects it and
 * where a compromised panel cannot reach it.
 *
 * Precedence: this file wins over CLI/env for the fields it defines, because
 * it is the more recent, deliberate act. Anything absent falls through.
 *
 * The Ollama URL is the dangerous field. The server fetches whatever it is
 * pointed at, so an admin panel that accepts any string is a server-side
 * request forgery primitive: on a VPS, `http://169.254.169.254/` hands back
 * cloud credentials. It is validated, not trusted.
 */

import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

export const SETTINGS_SCHEMA = 1

export interface ServerSettings {
  schemaVersion: number
  ollamaUrl?: string
  embedModel?: string
  /** ISO of the last change, and which token made it. */
  updatedAt?: string
  updatedBy?: string
}

export function settingsPath(dataDir: string): string {
  return join(dataDir, 'server-settings.json')
}

export type UrlRejection =
  | 'empty'
  | 'not-a-url'
  | 'bad-scheme'
  | 'has-credentials'
  | 'link-local'
  | 'has-path'

/**
 * Hosts a server must never be talked into fetching from.
 *
 * 169.254.169.254 is the cloud metadata endpoint on AWS, GCP, Azure, DO and
 * Hetzner alike — reachable from inside the box, unauthenticated, and it
 * returns credentials. The rest of 169.254/16 and fe80::/10 are link-local.
 */
function isLinkLocal(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h.startsWith('169.254.')) return true
  if (h.startsWith('fe80:') || h.startsWith('fe80::')) return true
  // metadata.google.internal and friends resolve to the same address.
  if (h === 'metadata' || h.endsWith('.internal') || h === 'metadata.google.internal') return true
  return false
}

export type UrlVerdict = { ok: true; url: string } | { ok: false; reason: UrlRejection; detail: string }

/**
 * Validate an Ollama base URL.
 *
 * Deliberately not a reachability check — a URL can be right and the service
 * down, and refusing to save the correct address because Ollama is restarting
 * is worse than saving it. Health reports reachability separately.
 */
export function validateOllamaUrl(input: string): UrlVerdict {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, reason: 'empty', detail: 'Adres nie może być pusty.' }

  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return { ok: false, reason: 'not-a-url', detail: 'To nie jest poprawny URL (np. http://127.0.0.1:11434).' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    // file: and unix: would make this a local file read primitive.
    return { ok: false, reason: 'bad-scheme', detail: `Dozwolone tylko http:// i https:// — dostałem ${u.protocol}` }
  }
  if (u.username || u.password) {
    return {
      ok: false,
      reason: 'has-credentials',
      detail: 'Nie zapisuję poświadczeń w URL — trafiłyby do logów przy każdym błędzie.',
    }
  }
  if (isLinkLocal(u.hostname)) {
    return {
      ok: false,
      reason: 'link-local',
      detail: `${u.hostname} to adres link-local / metadanych chmury — serwer nie będzie z niego pobierał.`,
    }
  }
  if (u.pathname !== '/' && u.pathname !== '') {
    // The client appends /api/embed itself; a path here silently breaks it.
    return { ok: false, reason: 'has-path', detail: 'Podaj sam adres bazowy, bez ścieżki.' }
  }
  return { ok: true, url: `${u.protocol}//${u.host}` }
}

/** Model names go into a URL-free JSON body, but a wild string is still noise. */
export function validateEmbedModel(input: string): { ok: true; model: string } | { ok: false; detail: string } {
  const m = (input ?? '').trim()
  if (!m) return { ok: false, detail: 'Nazwa modelu nie może być pusta.' }
  if (m.length > 128) return { ok: false, detail: 'Nazwa modelu jest absurdalnie długa.' }
  if (!/^[\w.:@/-]+$/.test(m)) return { ok: false, detail: 'Dozwolone znaki: litery, cyfry i . : @ / - _' }
  return { ok: true, model: m }
}

export async function readSettings(dataDir: string): Promise<ServerSettings> {
  try {
    const raw = await fs.readFile(settingsPath(dataDir), 'utf8')
    const o = JSON.parse(raw) as Partial<ServerSettings>
    return {
      schemaVersion: typeof o.schemaVersion === 'number' ? o.schemaVersion : SETTINGS_SCHEMA,
      ...(typeof o.ollamaUrl === 'string' ? { ollamaUrl: o.ollamaUrl } : {}),
      ...(typeof o.embedModel === 'string' ? { embedModel: o.embedModel } : {}),
      ...(typeof o.updatedAt === 'string' ? { updatedAt: o.updatedAt } : {}),
      ...(typeof o.updatedBy === 'string' ? { updatedBy: o.updatedBy } : {}),
    }
  } catch {
    // Absent or unreadable both mean "nothing overrides the unit", which is the
    // safe reading: a corrupt settings file must not brick a working server.
    return { schemaVersion: SETTINGS_SCHEMA }
  }
}

export async function writeSettings(dataDir: string, next: ServerSettings): Promise<void> {
  const p = settingsPath(dataDir)
  await fs.mkdir(dirname(p), { recursive: true })
  const tmp = `${p}.tmp`
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tmp, p)
}
