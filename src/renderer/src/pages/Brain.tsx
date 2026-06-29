import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BrainCircuit,
  Cpu,
  Database,
  FileArchive,
  FolderInput,
  Layers,
  Rocket,
  Search,
  Sparkles,
  Upload,
  X
} from 'lucide-react'
import { Badge, Button, GlassCard, Input, ProgressBar, Spinner } from '../components/ui'
import { sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import type { BrainHit, BrainRunResult, BrainStatus } from '../lib/types'
import { useStore } from '../store/useStore'

const STAGES = [
  { id: 'collect', label: 'Collect', icon: Database, note: 'from assistants' },
  { id: 'distill', label: 'Distill', icon: Sparkles, note: 'local LLM' },
  { id: 'index', label: 'Pre-index', icon: Layers, note: 'embeddings' },
  { id: 'deploy', label: 'Deploy', icon: Rocket, note: 'to Brain' }
] as const

export default function Brain() {
  const { sources, selected, toggleSelected } = useStore()
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [checking, setChecking] = useState(true)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  const [result, setResult] = useState<BrainRunResult | null>(null)
  const [importPath, setImportPath] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BrainHit[]>([])
  const [searching, setSearching] = useState(false)

  const [deployUrl, setDeployUrl] = useState('http://localhost:7860')
  const [reindex, setReindex] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [deployMsg, setDeployMsg] = useState('')

  async function check(url?: string) {
    setChecking(true)
    const s = await api.brainStatus(url || ollamaUrl || undefined)
    setStatus(s)
    if (!ollamaUrl) setOllamaUrl(s.baseUrl)
    setChecking(false)
  }
  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const distillable = sources.filter((s) => ['claude-code', 'cursor', 'claude-desktop'].includes(s.id))

  async function run() {
    setRunning(true)
    setResult(null)
    setProgress({ label: 'starting…', pct: 4 })
    const off = api.onBrainProgress((e) =>
      setProgress({
        label: `${e.phase}${e.detail ? ' · ' + e.detail.slice(0, 40) : ''}`,
        pct: e.total ? Math.round((e.done / e.total) * 100) : 0
      })
    )
    try {
      const sel = [...selected].filter((id) => distillable.some((d) => d.id === id))
      const r = await api.brainRun({
        sources: sel.length ? sel : distillable.map((d) => d.id),
        ollamaUrl,
        importPath: importPath || undefined
      })
      setResult(r)
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: 'Pipeline failed', detail: (e as Error).message })
    } finally {
      off()
      setRunning(false)
      setProgress(null)
    }
  }

  async function search() {
    if (!query) return
    setSearching(true)
    try {
      setHits(await api.brainSearch(query, ollamaUrl))
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: 'Search failed', detail: (e as Error).message })
    } finally {
      setSearching(false)
    }
  }

  async function deploy(to: 'filesystem' | 'dashboard') {
    setDeploying(true)
    try {
      let target: string | undefined
      if (to === 'filesystem') {
        target = (await api.pickDirectory()) || undefined
        if (!target) return
      }
      const r = await api.brainDeploy({ to, target, url: deployUrl, reindex, sources: distillable.map((d) => d.id) })
      setDeployMsg(r.detail)
      useStore.getState().toast({ kind: 'success', title: 'Deployed', detail: r.detail })
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: 'Deploy failed', detail: (e as Error).message })
    } finally {
      setDeploying(false)
    }
  }

  const stageState = (id: string): 'idle' | 'active' | 'done' => {
    if (!running && result) return 'done'
    if (running && progress) {
      if (id === 'collect') return 'done'
      if (progress.label.startsWith('distill')) return id === 'distill' ? 'active' : id === 'collect' ? 'done' : 'idle'
      if (progress.label.startsWith('index')) return id === 'index' ? 'active' : id === 'deploy' ? 'idle' : 'done'
    }
    return 'idle'
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <BrainCircuit className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">Send to Brain</h1>
          <p className="text-sm text-ink-dim">
            Hand your aggregated chats to your Brain server — it distills + indexes (GPU work stays server-side).
          </p>
        </div>
      </div>

      {/* Pipeline stages */}
      <GlassCard className="mb-5 flex items-center justify-between p-5">
        {STAGES.map((s, i) => {
          const st = stageState(s.id)
          const Icon = s.icon
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <motion.div
                  animate={{
                    scale: st === 'active' ? [1, 1.08, 1] : 1,
                    opacity: st === 'idle' ? 0.5 : 1
                  }}
                  transition={st === 'active' ? { repeat: Infinity, duration: 1.3 } : {}}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                    st === 'idle' ? 'border-white/10 bg-white/5' : 'accent-grad ring-glow border-transparent'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${st === 'idle' ? 'text-ink-faint' : 'text-white'}`} />
                </motion.div>
                <span className="text-xs font-semibold text-ink">{s.label}</span>
                <span className="text-[10px] text-ink-faint">{s.note}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="mx-2 h-px flex-1 bg-gradient-to-r from-white/20 to-white/5" />
              )}
            </div>
          )
        })}
      </GlassCard>

      {/* Ollama status */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Cpu className="h-4 w-4 text-iris" /> Local engine (Ollama)
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" className="w-64" />
          <Button variant="soft" onClick={() => check()} disabled={checking}>
            {checking ? <Spinner className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
            Recheck
          </Button>
          {status && (
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.reachable ? 'bg-mint' : 'bg-rose'}`} />
              <span className="text-sm text-ink-dim">
                {status.reachable ? `${status.models.length} models` : 'offline'}
              </span>
              {status.reachable && <Badge color="#8b5cf6">{status.chatModel}</Badge>}
              {status.reachable && <Badge color="#22d3ee">{status.embedModel}</Badge>}
            </div>
          )}
        </div>
      </GlassCard>

      {/* Run */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">Advanced · distill on this host</span>
          <span className="text-xs text-ink-faint">optional — needs local Ollama</span>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {distillable.map((s) => {
            const m = sourceMeta(s.id)
            const on = selected.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => toggleSelected(s.id)}
                className="no-drag rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  color: on ? '#06070d' : m.color,
                  background: on ? m.color : `${m.color}14`,
                  borderColor: `${m.color}55`
                }}
              >
                {s.label} {s.conversations != null ? `· ${s.conversations}` : ''}
              </button>
            )
          })}
        </div>
        {running && progress ? (
          <div className="space-y-2">
            <div className="text-sm text-ink-dim">{progress.label}</div>
            <ProgressBar value={progress.pct} />
          </div>
        ) : result ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="#34d399">{result.notes} notes</Badge>
            <Badge color="#9aa3bd">{result.stubs} stubs</Badge>
            <Badge color="#22d3ee">{result.chunks} chunks · dim {result.dim}</Badge>
            <span className="text-xs text-ink-faint">{result.notesDir}</span>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            Distills selected sources with {status?.chatModel ?? 'the local model'} and builds a searchable index.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={run} disabled={running || !status?.reachable}>
            {running ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            Run pipeline
          </Button>
          <Button
            variant="soft"
            disabled={running}
            onClick={async () => {
              const f = await api.pickFile()
              if (f) setImportPath(f)
            }}
          >
            <Upload className="h-4 w-4" /> Import export…
          </Button>
          {importPath && (
            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-ink-dim">
              <FileArchive className="h-3.5 w-3.5 text-cyan" />
              {importPath.split(/[\\/]/).pop()}
              <button onClick={() => setImportPath(null)} className="no-drag text-ink-faint hover:text-ink">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        {importPath && (
          <p className="mt-2 text-[11px] text-ink-faint">
            Run will distill the imported archive (Claude.ai / ChatGPT / Grok / Gemini) instead of live sources.
          </p>
        )}
      </GlassCard>

      {/* Search */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Search className="h-4 w-4 text-cyan" /> Search your knowledge (local RAG)
        </div>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="ask anything you've discussed before…"
          />
          <Button onClick={search} disabled={searching || !query}>
            {searching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {hits.map((h, i) => {
            const m = sourceMeta(h.source)
            return (
              <div key={i} className="rounded-xl border border-white/8 bg-black/20 p-3">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-mono text-cyan">{h.score.toFixed(3)}</span>
                  <span style={{ color: m.color }}>{m.label}</span>
                  <span className="truncate text-ink-faint">{h.notePath}</span>
                </div>
                <p className="text-xs leading-relaxed text-ink-dim">{h.text.replace(/\s+/g, ' ').slice(0, 220)}…</p>
              </div>
            )
          })}
        </div>
      </GlassCard>

      {/* Deploy */}
      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Rocket className="h-4 w-4 text-violet" /> Deploy to Brain
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} placeholder="http://brain-host:7860" className="w-56" />
          <button onClick={() => setReindex(!reindex)} className="no-drag flex items-center gap-2 text-sm text-ink-dim">
            <span className={`relative h-5 w-9 rounded-full transition-colors ${reindex ? 'accent-grad' : 'bg-white/12'}`}>
              <motion.span layout className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ left: reindex ? 18 : 2 }} />
            </span>
            reindex
          </button>
          <Button variant="soft" onClick={() => deploy('filesystem')} disabled={deploying}>
            <FolderInput className="h-4 w-4" /> To folder
          </Button>
          <Button onClick={() => deploy('dashboard')} disabled={deploying}>
            {deploying ? <Spinner className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            Push to Brain
          </Button>
        </div>
        {deployMsg && <p className="mt-3 text-xs text-mint">{deployMsg}</p>}
        <p className="mt-3 text-[11px] text-ink-faint">
          Folder deploy writes finished notes into a vault dir (Brain only embeds). Push sends chats to Brain's API.
        </p>
      </GlassCard>
    </div>
  )
}
