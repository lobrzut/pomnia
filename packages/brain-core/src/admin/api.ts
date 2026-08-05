// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The admin surface: the few things you must be able to do to a Pomnia server
 * without opening an SSH session.
 *
 * Deliberately small. The rich views — charts, the knowledge graph, browsing
 * notes — belong in Pomnia Desktop, which talks to this same API. Rebuilding
 * that here would put a login, sessions and a CSRF surface inside the one
 * process that holds the vault, to duplicate work already done elsewhere.
 *
 * Every route requires an **admin** token. An agent token reaches MCP and
 * replication and nothing here — otherwise handing a token to an assistant
 * would hand it the power to repoint the embedder and mint itself more.
 *
 * No cookies anywhere. The panel keeps its token in a page variable and sends
 * it as a header, which removes cross-site request forgery as a category
 * rather than mitigating it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

import { readSettings, validateEmbedModel, validateOllamaUrl, writeSettings } from './settings.js'
import { createToken, readTokens, revokeToken, summarise } from './tokens.js'
import {
  changePassword,
  createUser,
  deleteUser,
  readUsers,
  summariseUser,
} from './users.js'

export interface AdminDeps {
  dataDir: string
  tokensFile: string
  /**
   * Settings that live in the running config rather than a file: the handshake
   * phrase, auto-checkpoint, the instance label. Changing them takes effect on
   * the next tool listing, which is what makes them worth exposing at all.
   */
  runtime: {
    get(): RuntimeSettings
    set(next: Partial<RuntimeSettings>): void
  }
  /** Sessions to end when a password changes or an account is removed. */
  dropSessionsFor(username: string): number
  /** Applied live so a settings change does not need a restart. */
  applyOllama(next: { ollamaUrl?: string; embedModel?: string }): void
  currentOllama(): { ollamaUrl: string; embedModel: string }
  /** Take write ownership of the vault for this instance. */
  claimVault(): Promise<{ previous: string | null; owner: string }>
  startReindex(): { started: boolean; reason?: string }
  vaultState(): { writable: boolean; owner: string | null; readOnlyFlag: boolean }
}

export interface RuntimeSettings {
  handshakePhrase: string
  handshakeEnabled: boolean
  autoCheckpointEnabled: boolean
  instanceLabel: string
}

export interface AdminRequest {
  method: string
  path: string
  body: unknown
  /** Token or user name, for the audit line. Never the credential itself. */
  actor: string
}

export type AdminResponse = { status: number; body: unknown }

const j = (status: number, body: unknown): AdminResponse => ({ status, body })

/**
 * Every mutation gets a line in the journal with who did it.
 *
 * A self-hosted server has no other audit trail, and "who repointed Ollama at
 * a machine I do not recognise" is exactly the question you ask after the
 * fact, when the answer has to already exist.
 */
function audit(actor: string, what: string): void {
  console.error(`[brain-core] ADMIN ${actor}: ${what}`)
}

export async function handleAdmin(req: AdminRequest, deps: AdminDeps): Promise<AdminResponse> {
  const { method, path } = req

  // ── settings ────────────────────────────────────────────────────────────
  if (path === '/admin/settings' && method === 'GET') {
    const stored = await readSettings(deps.dataDir)
    const live = deps.currentOllama()
    return j(200, {
      // What is in effect right now, and what is pinned in the file. They
      // differ when the unit supplies a value the panel has not overridden,
      // and showing only one of them makes the other invisible.
      effective: live,
      stored: { ollamaUrl: stored.ollamaUrl ?? null, embedModel: stored.embedModel ?? null },
      updatedAt: stored.updatedAt ?? null,
      updatedBy: stored.updatedBy ?? null,
    })
  }

  if (path === '/admin/settings' && method === 'PUT') {
    const b = (req.body ?? {}) as { ollamaUrl?: unknown; embedModel?: unknown }
    const next = await readSettings(deps.dataDir)
    // Read before applying. Comparing after would compare the new value with
    // itself, and the warning below would never fire.
    const modelBefore = deps.currentOllama().embedModel

    if (b.ollamaUrl !== undefined) {
      const v = validateOllamaUrl(String(b.ollamaUrl))
      if (!v.ok) return j(400, { error: 'invalid_ollama_url', reason: v.reason, detail: v.detail })
      next.ollamaUrl = v.url
    }
    if (b.embedModel !== undefined) {
      const v = validateEmbedModel(String(b.embedModel))
      if (!v.ok) return j(400, { error: 'invalid_embed_model', detail: v.detail })
      next.embedModel = v.model
    }
    next.updatedAt = new Date().toISOString()
    next.updatedBy = req.actor
    await writeSettings(deps.dataDir, next)
    deps.applyOllama({ ollamaUrl: next.ollamaUrl, embedModel: next.embedModel })
    audit(req.actor, `settings → ollama=${next.ollamaUrl ?? '(unit)'} model=${next.embedModel ?? '(unit)'}`)

    // Changing the model invalidates every vector in the index, and an
    // incremental reindex will not notice: file contents did not change, so it
    // skips everything and reports success over a broken index.
    const modelChanged = next.embedModel !== undefined && next.embedModel !== modelBefore
    return j(200, {
      ok: true,
      effective: deps.currentOllama(),
      ...(modelChanged
        ? {
            warning:
              'Zmiana modelu unieważnia cały indeks. Przyrostowy reindeks tego NIE naprawi — trzeba usunąć library.db i zbudować od zera.',
          }
        : {}),
    })
  }

  // ── behaviour (runtime, no restart) ─────────────────────────────────────
  if (path === '/admin/behaviour' && method === 'GET') {
    return j(200, deps.runtime.get())
  }

  if (path === '/admin/behaviour' && method === 'PUT') {
    const b = (req.body ?? {}) as Partial<RuntimeSettings>
    const next: Partial<RuntimeSettings> = {}

    if (b.handshakePhrase !== undefined) {
      const phrase = String(b.handshakePhrase).trim()
      // The phrase is injected into every tool description an agent reads. A
      // long one wastes context on every single call; an empty one makes the
      // proof meaningless.
      if (phrase.length < 3 || phrase.length > 64) {
        return j(400, { error: 'invalid_phrase', detail: 'Fraza: od 3 do 64 znaków.' })
      }
      if (/[\r\n]/.test(phrase)) {
        return j(400, { error: 'invalid_phrase', detail: 'Fraza nie może zawierać nowej linii.' })
      }
      next.handshakePhrase = phrase
    }
    if (b.handshakeEnabled !== undefined) next.handshakeEnabled = b.handshakeEnabled === true
    if (b.autoCheckpointEnabled !== undefined) next.autoCheckpointEnabled = b.autoCheckpointEnabled === true
    if (b.instanceLabel !== undefined) {
      const label = String(b.instanceLabel).trim()
      if (!label || label.length > 64) {
        return j(400, { error: 'invalid_label', detail: 'Nazwa instancji: 1–64 znaki.' })
      }
      next.instanceLabel = label
    }

    deps.runtime.set(next)
    audit(req.actor, `behaviour → ${Object.keys(next).join(', ') || '(nothing)'}`)
    return j(200, { ok: true, ...deps.runtime.get() })
  }

  // ── users ───────────────────────────────────────────────────────────────
  if (path === '/admin/users' && method === 'GET') {
    return j(200, { users: (await readUsers(deps.dataDir)).map(summariseUser) })
  }

  if (path === '/admin/users' && method === 'POST') {
    const b = (req.body ?? {}) as { username?: unknown; password?: unknown; role?: unknown }
    if (b.role !== undefined && b.role !== 'admin') {
      // Login refuses anything but an admin, so a non-admin account is one that
      // can never sign in. Creating it silently would leave someone convinced
      // they had access and wondering why the password "does not work".
      return j(400, {
        error: 'invalid_role',
        detail: 'Konta panelu są zawsze administratorami — dla maszyn wydaj token w zakładce Klienci.',
      })
    }
    const r = await createUser(deps.dataDir, {
      username: String(b.username ?? ''),
      password: String(b.password ?? ''),
      role: 'admin',
    })
    if (!r.ok) return j(400, { error: 'invalid_user', detail: r.detail })
    audit(req.actor, `created user "${r.summary.username}" (${r.summary.role})`)
    return j(201, r.summary)
  }

  if (path.startsWith('/admin/users/') && path.endsWith('/password') && method === 'PUT') {
    const username = decodeURIComponent(path.slice('/admin/users/'.length, -'/password'.length))
    const b = (req.body ?? {}) as { password?: unknown }
    const r = await changePassword(deps.dataDir, username, String(b.password ?? ''))
    if (!r.ok) return j(400, { error: 'change_failed', detail: r.detail })
    // A password change that leaves the old sessions alive has not changed
    // anything for whoever already had one.
    const dropped = deps.dropSessionsFor(r.summary.username)
    audit(req.actor, `changed password for "${username}" (${dropped} session(s) ended)`)
    return j(200, { ok: true, sessionsEnded: dropped })
  }

  if (path.startsWith('/admin/users/') && method === 'DELETE') {
    const username = decodeURIComponent(path.slice('/admin/users/'.length))
    const r = await deleteUser(deps.dataDir, username)
    if (!r.ok) return j(400, { error: 'delete_failed', detail: r.detail })
    deps.dropSessionsFor(r.summary.username)
    audit(req.actor, `deleted user "${username}"`)
    return j(200, { ok: true, username: r.summary.username })
  }

  // ── tokens ──────────────────────────────────────────────────────────────
  if (path === '/admin/tokens' && method === 'GET') {
    return j(200, { tokens: (await readTokens(deps.tokensFile)).map(summarise) })
  }

  if (path === '/admin/tokens' && method === 'POST') {
    const b = (req.body ?? {}) as { name?: unknown; role?: unknown }
    const role = b.role === 'admin' ? 'admin' : 'agent'
    const r = await createToken(deps.tokensFile, { name: String(b.name ?? ''), role })
    if (!r.ok) return j(400, { error: 'invalid_token', detail: r.detail })
    audit(req.actor, `created ${role} token "${r.summary.name}"`)
    // The only time the secret is ever returned. There is no read-back route.
    return j(201, { token: r.token, summary: r.summary })
  }

  if (path.startsWith('/admin/tokens/') && method === 'DELETE') {
    const name = decodeURIComponent(path.slice('/admin/tokens/'.length))
    const r = await revokeToken(deps.tokensFile, name)
    if (!r.ok) return j(400, { error: 'revoke_failed', detail: r.detail })
    audit(req.actor, `revoked token "${name}"`)
    return j(200, { ok: true, name })
  }

  // ── vault ───────────────────────────────────────────────────────────────
  if (path === '/admin/vault' && method === 'GET') {
    return j(200, deps.vaultState())
  }

  if (path === '/admin/vault/claim' && method === 'POST') {
    const state = deps.vaultState()
    if (state.readOnlyFlag) {
      // The flag is the operator's explicit instruction in the unit file. A
      // panel that could override it would make the unit a suggestion.
      return j(409, {
        error: 'pinned_read_only',
        detail:
          'Ten serwer jest przypięty jako replika (--read-only w unicie systemd). Usuń tę flagę i zrestartuj, zanim przejmiesz vault.',
      })
    }
    const r = await deps.claimVault()
    audit(req.actor, `claimed vault (previous owner: ${r.previous ?? 'none'})`)
    return j(200, {
      ok: true,
      ...r,
      warning: r.previous
        ? `${r.previous} zacznie odmawiać zapisów do tego vaultu. Zsynchronizuj go, zanim cokolwiek jeszcze zapisze.`
        : undefined,
    })
  }

  // ── index ───────────────────────────────────────────────────────────────
  if (path === '/admin/reindex' && method === 'POST') {
    const r = deps.startReindex()
    if (r.started) audit(req.actor, 'started reindex')
    return j(r.started ? 202 : 200, r)
  }

  return j(404, { error: 'not_found' })
}

/** Read a bounded JSON body; anything larger is refused rather than buffered. */
export async function readAdminBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'DELETE') return null
  const chunks: Buffer[] = []
  let total = 0
  for await (const c of req) {
    total += (c as Buffer).length
    if (total > limit) throw new Error('body too large')
    chunks.push(c as Buffer)
  }
  if (total === 0) return null
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function sendAdmin(res: ServerResponse, r: AdminResponse): void {
  res.statusCode = r.status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(r.body))
}
