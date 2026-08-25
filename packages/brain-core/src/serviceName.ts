// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What this server calls itself, and what counts as recognising it.
 *
 * The rename from brain-core to Pomnia has been half-done for a while: the
 * status page introduces itself as Pomnia while /healthz and the MCP handshake
 * still answer "brain-core". That inconsistency has already cost something —
 * a test asserting the old name sat red on a branch for four days, because the
 * page had moved on and the assertion had not.
 *
 * Finishing it is not a string swap. Five call sites identify this server by
 * `service === 'brain-core'`: the desktop locating its own embedded core, the
 * doctor, the engine probe, and the server checking whether something is
 * already listening. Renaming the emitter alone would leave every one of them
 * failing to recognise a server that was answering perfectly well — the exact
 * "reachable but is it the right thing" failure this project has hit before.
 *
 * So readers learn both names first and the emitter changes after, in a later
 * release. Until then a fleet can be mixed without either half going blind.
 */

/** Emitted in /healthz and the MCP handshake. */
export const SERVICE_NAME = 'brain-core'

/** Every name a Pomnia server has answered to. Order is oldest first. */
export const SERVICE_ALIASES = ['brain-core', 'pomnia'] as const

/**
 * Is this /healthz body one of ours?
 *
 * Accepts any historical name so a client never fails to recognise a server it
 * can otherwise talk to. Case-insensitive because the value has been written by
 * hand into probes and proxies.
 */
export function isPomniaService(service: unknown): boolean {
  if (typeof service !== 'string') return false
  const v = service.trim().toLowerCase()
  return (SERVICE_ALIASES as readonly string[]).includes(v)
}
