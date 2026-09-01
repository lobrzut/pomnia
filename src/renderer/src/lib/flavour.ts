// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Which Pomnia this build is.
 *
 * `full` is the app as it has always been: it reads the assistants' own stores,
 * distils on a local GPU, imports documents, and can run a brain inside itself.
 *
 * `mini` is the other half of a self-hosted pair. It holds the encrypted vault,
 * wires MCP into the agents, and replicates to a brain-core running elsewhere.
 * It has no brain of its own, no Ollama, no distiller and no importer.
 *
 * The split is not a guess about what people need. Measured on a live vault:
 * before MCP existed, 1626 notes were distilled because there was no other way
 * to get anything in. After it, the client whose MCP actually worked saved
 * directly 69% of the time, while the one whose search was broken saved 7% and
 * had 492 conversations distilled to make up for it. Distillation was standing
 * in for wiring that did not work. Wiring is what Mini is for.
 *
 * A flavour, not a fork: two copies of Connect would drift, and Connect is the
 * one screen this product cannot afford to have two versions of.
 */

export type Flavour = 'full' | 'mini'

/**
 * Read once. A build is one flavour for its whole life, and re-reading it per
 * render invites a UI that is half one thing and half the other.
 */
export const FLAVOUR: Flavour =
  (import.meta.env?.VITE_POMNIA_FLAVOUR as Flavour | undefined) === 'mini' ? 'mini' : 'full'

export const isMini = FLAVOUR === 'mini'

/**
 * Routes Mini ships.
 *
 * `connect` is the reason it exists. `settings` carries the server address, the
 * token and the vault controls. Everything else belongs to collecting or
 * distilling, which Mini does not do.
 */
export const MINI_ROUTES = ['connect', 'settings'] as const
