// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * VRAM profiles — curated model sets per GPU size class.
 *
 * One decision the user actually faces: "which chat model fits my card?".
 * The embed model is deliberately THE SAME across all profiles — switching
 * the embedding model invalidates every stored vector and forces a full
 * reindex (see project memory embedding-vs-distill-model-choice), so it is
 * not a per-profile knob.
 *
 * qwen2.5 family for chat/distill: proven to return valid JSON reliably on
 * long transcripts where same-size Mistral/Llama drifted (why 14b became the
 * default). Sizes are Ollama download sizes, rounded for display.
 *
 * IMPORTANT: keep this file free of node imports — the renderer bundles it
 * directly (deep import, not through the barrel) for the browser preview.
 */

export interface VramProfile {
  id: 'lite' | 'standard' | 'max'
  label: string
  /** Display range of GPU memory this profile is sized for. */
  vram: string
  blurb: string
  chatModel: string
  /** Rounded download size of the chat model, for display. */
  chatSize: string
  recommended?: boolean
}

/** Shared across every profile — changing it would force a full reindex. */
export const PROFILE_EMBED_MODEL = 'nomic-embed-text'
export const PROFILE_EMBED_SIZE = '274 MB'

export const VRAM_PROFILES: VramProfile[] = [
  {
    id: 'lite',
    label: 'Lite',
    vram: '4–8 GB',
    blurb: 'Laptop / older GPU. Fast distillation, shorter context — fine for note-taking.',
    chatModel: 'qwen2.5:3b',
    chatSize: '1.9 GB'
  },
  {
    id: 'standard',
    label: 'Standard',
    vram: '12–16 GB',
    blurb: 'The sweet spot. Reliable JSON on long transcripts — the battle-tested default.',
    chatModel: 'qwen2.5:14b',
    chatSize: '9.0 GB',
    recommended: true
  },
  {
    id: 'max',
    label: 'Max',
    vram: '24 GB+',
    blurb: 'Workstation class. Highest distillation quality, noticeably slower per note.',
    chatModel: 'qwen2.5:32b',
    chatSize: '20 GB'
  }
]
