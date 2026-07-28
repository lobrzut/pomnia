// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Single truth for “does this tool read Pomnia memory via MCP?” on Dashboard
 * cards and Settings → MCP clients toggles. Same formula as Connect visibility:
 * override wins, else configExists from connectStatus detection.
 */
import type { ClientId, ClientStatus } from './types'

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
