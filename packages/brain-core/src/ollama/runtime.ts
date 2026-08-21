// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Cheap Ollama runtime probe for admin honesty (GPU vs CPU).
 *
 * Uses GET /api/ps only — no generate, no nvidia-smi. `size_vram > 0` on a
 * loaded model is the signal Ollama itself reports; we never invent a GPU.
 */

export type AcceleratorHint = 'gpu' | 'cpu' | 'idle' | 'unknown' | 'n/a'

export interface OllamaRunningModel {
  name: string
  size: number
  sizeVram: number
}

export interface OllamaRuntimeSnapshot {
  reachable: boolean
  accelerator: AcceleratorHint
  /** One honest line for Silnik / health consumers. */
  summary: string
  running: OllamaRunningModel[]
}

type PsModel = {
  name?: string
  model?: string
  size?: number
  size_vram?: number
}

const EMPTY_NA: OllamaRuntimeSnapshot = {
  reachable: false,
  accelerator: 'n/a',
  summary: 'Embedder lokalny (bez Ollamy na tej ścieżce).',
  running: [],
}

/** Classify loaded models from Ollama /api/ps JSON. */
export function classifyOllamaPs(models: PsModel[]): OllamaRuntimeSnapshot {
  const running: OllamaRunningModel[] = models.map((m) => ({
    name: String(m.name || m.model || 'unknown'),
    size: typeof m.size === 'number' ? m.size : 0,
    sizeVram: typeof m.size_vram === 'number' ? m.size_vram : 0,
  }))
  if (running.length === 0) {
    return {
      reachable: true,
      accelerator: 'idle',
      summary:
        'Ollama osiągalna · brak załadowanego modelu · GPU jeśli Ollama tak skonfiguruje przy load',
      running,
    }
  }
  const names = running.map((r) => r.name).join(', ')
  const anyVram = running.some((r) => r.sizeVram > 0)
  const allCpu = running.every((r) => r.sizeVram === 0 && r.size > 0)
  if (anyVram) {
    const vramMb = Math.round(running.reduce((a, r) => a + r.sizeVram, 0) / (1024 * 1024))
    return {
      reachable: true,
      accelerator: 'gpu',
      summary: `Ollama · ${names} · GPU (VRAM ~${vramMb} MB)`,
      running,
    }
  }
  if (allCpu) {
    return {
      reachable: true,
      accelerator: 'cpu',
      summary: `Ollama · ${names} · CPU (size_vram=0)`,
      running,
    }
  }
  return {
    reachable: true,
    accelerator: 'unknown',
    summary: `Ollama · ${names} · akcelerator niewykryty tanio (/api/ps)`,
    running,
  }
}

/**
 * Probe Ollama /api/ps. Short timeout — health must not hang.
 * Empty `baseUrl` → n/a snapshot (fastembed appliance path).
 */
export async function probeOllamaRuntime(
  baseUrl: string,
  timeoutMs = 2_500,
): Promise<OllamaRuntimeSnapshot> {
  const base = (baseUrl || '').replace(/\/$/, '')
  if (!base) return { ...EMPTY_NA }

  try {
    const r = await fetch(`${base}/api/ps`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r.ok) {
      return {
        reachable: false,
        accelerator: 'unknown',
        summary: `Ollama /api/ps HTTP ${r.status}`,
        running: [],
      }
    }
    const j = (await r.json()) as { models?: PsModel[] }
    return classifyOllamaPs(Array.isArray(j.models) ? j.models : [])
  } catch (e) {
    return {
      reachable: false,
      accelerator: 'unknown',
      summary: `Ollama niedostępna: ${(e as Error).message}`,
      running: [],
    }
  }
}
