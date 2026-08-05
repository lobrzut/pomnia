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

export interface AdminDeps {
  dataDir: string
  tokensFile: string
  /** Applied live so a settings change does not need a restart. */
  applyOllama(next: { ollamaUrl?: string; embedModel?: string }): void
  currentOllama(): { ollamaUrl: string; embedModel: string }
  /** Take write ownership of the vault for this instance. */
  claimVault(): Promise<{ previous: string | null; owner: string }>
  startReindex(): { started: boolean; reason?: string }
  vaultState(): { writable: boolean; owner: string | null; readOnlyFlag: boolean }
}

export interface AdminRequest {
  method: string
  path: string
  body: unknown
  /** Token name, for the audit line. Never the token itself. */
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
