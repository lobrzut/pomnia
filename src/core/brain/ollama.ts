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

export interface OllamaConfig {
  baseUrl: string
  chatModel: string
  embedModel: string
}

export function defaultOllamaConfig(): OllamaConfig {
  return {
    baseUrl: process.env.RELIQUA_OLLAMA || 'http://localhost:11434',
    chatModel: process.env.RELIQUA_OLLAMA_MODEL || 'qwen2.5:14b',
    embedModel: process.env.RELIQUA_EMBED_MODEL || 'nomic-embed-text'
  }
}

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
    opts: { system?: string; model?: string; json?: boolean; temperature?: number; timeoutMs?: number } = {}
  ): Promise<string> {
    const body = {
      model: opts.model || this.cfg.chatModel,
      prompt,
      system: opts.system,
      stream: false,
      format: opts.json ? 'json' : undefined,
      options: { temperature: opts.temperature ?? 0.2 }
    }
    const r = await fetch(`${this.cfg.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 300_000)
    })
    if (!r.ok) throw new Error(`ollama generate ${r.status}: ${await r.text().catch(() => '')}`)
    const j = (await r.json()) as { response?: string }
    return j.response ?? ''
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
