// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Managing who may connect — the "users" of a Pomnia server.
 *
 * Pomnia is single-user by design: one person, one vault, one USER.md. What it
 * has several of is *clients* — a laptop, a phone, a CI job, an agent on
 * another machine — and those are what need issuing and revoking. Calling them
 * users would promise per-person isolation this server does not implement.
 *
 * Two roles, and the distinction is the whole reason this file exists:
 *
 *   agent   MCP + replication. What you hand to Claude Code, Cursor, a script.
 *   admin   the above plus changing settings, issuing tokens, taking the vault.
 *
 * A token is shown once, at creation. There is no "reveal" — the file is the
 * only copy, and an endpoint that hands tokens back turns one leaked admin
 * credential into every credential.
 */

import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

import type { TokenRole } from '../mcp/auth.js'

export interface StoredToken {
  name: string
  token: string
  role: TokenRole
  created: string
  /** Set by the auth gate on use; absent until first seen. */
  lastUsed?: string
}

/** What an admin may look at: everything except the secret. */
export interface TokenSummary {
  name: string
  role: TokenRole
  created: string
  lastUsed?: string
  /** First 8 characters, so a person can tell two entries apart. */
  hint: string
}

const NAME_RE = /^[\w .\-@]{1,64}$/

export function validateTokenName(input: string): { ok: true; name: string } | { ok: false; detail: string } {
  const name = (input ?? '').trim()
  if (!name) return { ok: false, detail: 'Nazwa nie może być pusta.' }
  if (!NAME_RE.test(name)) {
    return { ok: false, detail: 'Dozwolone: litery, cyfry, spacja i . - _ @ (do 64 znaków).' }
  }
  return { ok: true, name }
}

/**
 * 32 bytes from the CSPRNG, base64url, prefixed so it is recognisable in a
 * config file and greppable in a leak.
 */
export function mintToken(): string {
  return `btk_${randomBytes(32).toString('base64url')}`
}

export function summarise(t: StoredToken): TokenSummary {
  return {
    name: t.name,
    role: t.role,
    created: t.created,
    ...(t.lastUsed ? { lastUsed: t.lastUsed } : {}),
    hint: `${t.token.slice(0, 12)}…`,
  }
}

export async function readTokens(file: string): Promise<StoredToken[]> {
  try {
    const parsed = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^﻿/, '')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((e): e is StoredToken => !!e && typeof e === 'object' && typeof (e as StoredToken).token === 'string')
      .map((e) => ({
        name: typeof e.name === 'string' ? e.name : '?',
        token: e.token,
        role: e.role === 'admin' ? 'admin' : 'agent',
        created: typeof e.created === 'string' ? e.created : new Date().toISOString(),
        ...(typeof e.lastUsed === 'string' ? { lastUsed: e.lastUsed } : {}),
      }))
  } catch {
    return []
  }
}

async function writeTokens(file: string, tokens: StoredToken[]): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  // 0600 at creation, not chmod after: a token file that is world-readable for
  // even a moment has been readable for long enough.
  await fs.writeFile(tmp, `${JSON.stringify(tokens, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(tmp, file)
}

export type CreateResult =
  | { ok: true; token: string; summary: TokenSummary }
  | { ok: false; detail: string }

export async function createToken(
  file: string,
  opts: { name: string; role: TokenRole },
): Promise<CreateResult> {
  const name = validateTokenName(opts.name)
  if (!name.ok) return { ok: false, detail: name.detail }

  const tokens = await readTokens(file)
  if (tokens.some((t) => t.name.toLowerCase() === name.name.toLowerCase())) {
    // Two entries with one name makes revocation ambiguous, which is the
    // moment you least want ambiguity.
    return { ok: false, detail: `Token o nazwie „${name.name}" już istnieje.` }
  }
  const entry: StoredToken = {
    name: name.name,
    token: mintToken(),
    role: opts.role === 'admin' ? 'admin' : 'agent',
    created: new Date().toISOString(),
  }
  await writeTokens(file, [...tokens, entry])
  return { ok: true, token: entry.token, summary: summarise(entry) }
}

export type RevokeResult = { ok: true; name: string } | { ok: false; detail: string }

/**
 * Revoking is by name, never by the secret: an admin should not have to paste
 * a credential to destroy it, and the panel never has it to paste.
 */
export async function revokeToken(file: string, name: string): Promise<RevokeResult> {
  const tokens = await readTokens(file)
  const target = tokens.find((t) => t.name === name)
  if (!target) return { ok: false, detail: `Nie ma tokena o nazwie „${name}".` }

  if (target.role === 'admin' && tokens.filter((t) => t.role === 'admin').length === 1) {
    // Locking yourself out of your own server is recoverable only over SSH.
    // Refusing costs one extra step; not refusing costs an evening.
    return {
      ok: false,
      detail: 'To ostatni token administratora — najpierw utwórz drugi, potem odbierz ten.',
    }
  }
  await writeTokens(
    file,
    tokens.filter((t) => t.name !== name),
  )
  return { ok: true, name }
}

/** Record that a token was seen. Best-effort: a failed write must not deny access. */
export async function touchToken(file: string, name: string): Promise<void> {
  const tokens = await readTokens(file)
  const t = tokens.find((x) => x.name === name)
  if (!t) return
  const now = new Date().toISOString()
  // Once a minute is plenty. Rewriting the file on every request would make
  // the auth gate's mtime cache useless and re-read tokens constantly.
  if (t.lastUsed && Date.parse(now) - Date.parse(t.lastUsed) < 60_000) return
  t.lastUsed = now
  await writeTokens(file, tokens)
}
