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
  id: 'lite' | 'standard'
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

/**
 * Distillation models by how much VRAM you have.
 *
 * Standard was qwen2.5:14b, described here as the battle-tested default, on the
 * assumption that a larger model writes a better note. Measured against the gate
 * that decides whether a note reaches retrieval at all, llama3.1:8b scored 6.853
 * to 14b’s 5.838 over 30 conversations, passed the gate on 87% against 73%,
 * recorded nearly twice as many failed attempts, and ran about twice as fast.
 * Replicated on a second machine with a different GPU and confirmed on a
 * held-out set read by hand. So Standard is now the 8B.
 *
 * There is no longer a Max tier. It offered qwen2.5:32b at 20 GB on the
 * assumption that a bigger model writes a better note — the same assumption
 * the measurement above had just refuted, one size class down. Nothing here
 * ever tested it, and it could not be: on the hardware available a 32B has to
 * be split across two cards, which makes the throughput number a measurement
 * of PCIe rather than of the model. Its other claim, the longest context, was
 * answering a problem nobody has — prompts measure around 4062 tokens against
 * a window of 8192.
 *
 * A tier that promises quality, cannot be measured, and sits behind small
 * print saying so is the same failure this project spent a week removing
 * everywhere else: a confident label with nothing behind it. Someone with a
 * 24 GB card is better served running Standard and having the card free.
 *
 * Lite stays, described as what it is. It is not the bottom of a quality
 * ladder; it is the only thing that runs on a 4–6 GB card, where the 8B does
 * not fit alongside anything else.
 *
 * Numbers come from one corpus (Polish and English, homelab and development
 * work) — the rig that produced them is in lobrzut/pomnia-lab if yours looks
 * different.
 */
export const VRAM_PROFILES: VramProfile[] = [
  {
    id: 'lite',
    label: 'Lite',
    vram: '4–6 GB',
    blurb: 'For a card the 8B will not fit on. Chosen by what runs, not by quality — not measured against the gate.',
    chatModel: 'qwen2.5:3b',
    chatSize: '1.9 GB'
  },
  {
    id: 'standard',
    label: 'Standard',
    vram: '8–12 GB',
    blurb: 'Best measured notes per second: higher scores than the 14B and roughly twice the speed.',
    chatModel: 'llama3.1:8b',
    chatSize: '4.7 GB',
    recommended: true
  }
]
