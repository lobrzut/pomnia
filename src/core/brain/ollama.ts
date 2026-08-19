// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Minimal Ollama client (zero deps, global fetch). Points at a host-local Ollama
 * by default — the whole idea is to do distillation + embedding on the user's own
 * GPU box, not on the Brain VM. Base URL is configurable so the same code drives
 * localhost:11434 (the GPU box) or a LAN Ollama.
 */
import { log } from '../log.js'

export interface OllamaModel {
  name: string
  size?: number
}

export interface PullProgress {
  /** Ollama's human phase string: "pulling manifest", "downloading", "verifying sha256 digest", "success"… */
  status: string
  /** Bytes done/total for the current layer — only present during downloads. */
  completed?: number
  total?: number
}

export interface OllamaConfig {
  baseUrl: string
  chatModel: string
  embedModel: string
}

export function defaultOllamaConfig(): OllamaConfig {
  return {
    baseUrl: process.env.POMNIA_OLLAMA || process.env.RELIQUA_OLLAMA || 'http://127.0.0.1:11434',
    chatModel: process.env.POMNIA_OLLAMA_MODEL || process.env.RELIQUA_OLLAMA_MODEL || 'qwen2.5:14b',
    embedModel: process.env.POMNIA_EMBED_MODEL || process.env.RELIQUA_EMBED_MODEL || 'nomic-embed-text'
  }
}

/** Empty / invalid / loopback → local install. LAN/hostname URLs are remote daemons. */
export function ollamaUrlLooksLocal(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return true
  try {
    const h = new URL(trimmed).hostname.toLowerCase()
    return h === '127.0.0.1' || h === 'localhost' || h === '::1'
  } catch {
    return true
  }
}

/** macOS Electron/Node often cannot open LAN sockets; use a launchd localhost relay. */
export function ollamaNeedsMacOsRelay(baseUrl: string, platform = process.platform): boolean {
  if (platform !== 'darwin') return false
  return !ollamaUrlLooksLocal(baseUrl)
}

export { hasOllamaModel } from './modelMatch.js'

export class Ollama {
  constructor(readonly cfg: OllamaConfig = defaultOllamaConfig()) {}

  async reachable(): Promise<boolean> {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
      return r.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const r = await fetch(`${this.cfg.baseUrl}/api/tags`, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return []
      const j = (await r.json()) as { models?: Array<{ name: string; size?: number }> }
      return (j.models ?? []).map((m) => ({ name: m.name, size: m.size }))
    } catch {
      return []
    }
  }

  /** One-shot generation. `json: true` asks Ollama to constrain output to JSON. */
  async generate(
    prompt: string,
    opts: {
      system?: string
      model?: string
      json?: boolean
      temperature?: number
      timeoutMs?: number
      signal?: AbortSignal
    } = {}
  ): Promise<string> {
    const body = {
      model: opts.model || this.cfg.chatModel,
      prompt,
      system: opts.system,
      stream: false,
      format: opts.json ? 'json' : undefined,
      options: { temperature: opts.temperature ?? 0.2 }
    }
    const timeoutMs = opts.timeoutMs ?? 300_000
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)]
    if (opts.signal) signals.push(opts.signal)
    const signal = AbortSignal.any(signals)
    const r = await fetch(`${this.cfg.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
    if (!r.ok) throw new Error(`ollama generate ${r.status}: ${await r.text().catch(() => '')}`)
    const j = (await r.json()) as { response?: string }
    return j.response ?? ''
  }

  /**
   * Pull a model with streamed progress. Ollama answers NDJSON lines:
   *   {"status":"pulling manifest"}
   *   {"status":"downloading","digest":"sha256:…","total":N,"completed":M}
   *   {"status":"success"}
   * No global timeout — a 20 GB model on slow WiFi legitimately takes an hour.
   * Abort via the optional signal instead.
   */
  async pull(model: string, onProgress?: (p: PullProgress) => void, signal?: AbortSignal): Promise<void> {
    const r = await fetch(`${this.cfg.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal
    })
    if (!r.ok || !r.body) throw new Error(`ollama pull ${r.status}: ${await r.text().catch(() => '')}`)

    const reader = r.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      // NDJSON: complete lines end with \n; keep the trailing partial in buf.
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const j = JSON.parse(line) as PullProgress & { error?: string }
          if (j.error) throw new Error(j.error)
          onProgress?.(j)
        } catch (e) {
          if (e instanceof SyntaxError) continue // torn line — ignore
          throw e
        }
      }
    }
  }

  /** Embed one or more strings. Tries /api/embed (batch) then falls back to /api/embeddings. */
  async embed(input: string[], model?: string): Promise<number[][]> {
    const m = model || this.cfg.embedModel
    try {
      const r = await fetch(`${this.cfg.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: m, input }),
        signal: AbortSignal.timeout(120_000)
      })
      if (r.ok) {
        const j = (await r.json()) as { embeddings?: number[][] }
        if (j.embeddings?.length) return j.embeddings
      }
    } catch (e) {
      log.debug('embed batch failed, falling back:', (e as Error).message)
    }
    // Fallback: one-by-one via legacy endpoint.
    const out: number[][] = []
    for (const text of input) {
      const r = await fetch(`${this.cfg.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: m, prompt: text }),
        signal: AbortSignal.timeout(120_000)
      })
      if (!r.ok) throw new Error(`ollama embeddings ${r.status}`)
      const j = (await r.json()) as { embedding?: number[] }
      out.push(j.embedding ?? [])
    }
    return out
  }
}
