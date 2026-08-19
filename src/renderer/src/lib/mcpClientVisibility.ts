// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Connect list visibility ≠ “this agent reads THIS app's Brain”.
 *
 * Settings toggles still use config-file presence (show Cursor even when the
 * host is wrong). Dashboard MCP copy must follow Connect's live `state`.
 */
import type { ClientId, ClientStatus, WiredState } from './types'

/** Show this client in Connect / Settings lists. Not a live handshake. */
export function isMcpClientActive(
  id: ClientId | string,
  clients: ClientStatus[],
  override: Partial<Record<ClientId, boolean>>,
): boolean {
  const c = clients.find((x) => x.id === id)
  const detected = !!c?.configExists
  const o = override[id as ClientId]
  return o ?? detected
}

/** Same truth as Connect badges: wired only if config points at THIS Brain and it answers. */
export function mcpClientMemoryState(
  id: ClientId | string,
  clients: ClientStatus[],
): WiredState {
  return clients.find((x) => x.id === id)?.state ?? 'not_wired'
}
