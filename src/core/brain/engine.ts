// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Name the engine that answered — not just that something did.
 *
 * A reachability check asks "is anybody there", and on this network the answer
 * was yes for the wrong process: the desktop carried a saved remote URL from an
 * older machine pointing at the legacy Python brain's auth proxy. It answered
 * every probe, the badge went green, and switching to server mode would have
 * silently wired every agent to a corpus three weeks stale — a different brain
 * over a different vault, indistinguishable from the right one at the UI level.
 *
 * The two are told apart by what /healthz says about itself:
 *
 *   brain-core     {"ok":true,"service":"brain-core","auth":true}
 *   legacy Python  {"ok":true,"upstream":"http://127.0.0.1:7863","tokens":4}
 *
 * Leaf module on purpose: no imports, so the renderer can use it without
 * dragging node:fs in through the logger. Four drifted copies of a helper is a
 * lesson this codebase has already paid for once.
 */

export type BrainEngine = 'brain-core' | 'legacy-python' | 'unknown'

export interface EngineInfo {
  engine: BrainEngine
  /** Short human label for badges and status lines. */
  label: string
  /**
   * True only for brain-core. Everything else may answer, may even speak MCP,
   * but does not share this desktop's index format or vault contract — so
   * pointing at it is a data decision, not a connectivity detail.
   */
  compatible: boolean
}

const BRAIN_CORE: EngineInfo = { engine: 'brain-core', label: 'brain-core', compatible: true }

const LEGACY: EngineInfo = {
  engine: 'legacy-python',
  label: 'legacy Python brain — not brain-core',
  compatible: false,
}

const UNKNOWN: EngineInfo = {
  engine: 'unknown',
  label: 'odpowiada, ale nie przedstawia się jako brain-core',
  compatible: false,
}

/**
 * Classify a /healthz payload.
 *
 * `undefined` covers both "no JSON body" and "never asked" — the caller knows
 * which, and neither is evidence of brain-core, so both land on `unknown`.
 */
export function identifyEngine(data: Record<string, unknown> | undefined | null): EngineInfo {
  if (!data || typeof data !== 'object') return UNKNOWN
  if (data.service === 'brain-core') return BRAIN_CORE
  // The proxy names what it fronts; brain-core has nothing in front of it.
  if (typeof data.upstream === 'string' && data.upstream) return LEGACY
  if (typeof data.tokens === 'number' && data.service === undefined) return LEGACY
  return UNKNOWN
}
