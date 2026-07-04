import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BrainCircuit,
  Check,
  Cpu,
  Database,
  Download,
  FileArchive,
  FolderInput,
  Layers,
  Rocket,
  Search,
  Sparkles,
  Upload,
  X
} from 'lucide-react'
import clsx from 'clsx'
import { Badge, Button, GlassCard, Input, ProgressBar, Spinner } from '../components/ui'
import { sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import { VRAM_PROFILES, PROFILE_EMBED_MODEL, PROFILE_EMBED_SIZE } from '@core/brain/profiles'
import type { BrainHit, BrainRunResult, BrainStatus, OllamaPullEvent } from '../lib/types'
import { useStore } from '../store/useStore'

const PROFILE_KEY = 'reliqua.brain.profile'

/** "qwen2.5:14b" and "qwen2.5:14b" match; "nomic-embed-text" matches "nomic-embed-text:latest". */
function hasModel(models: string[], want: string): boolean {
  return models.some((m) => m === want || m === `${want}:latest` || m.replace(/:latest$/, '') === want)
}

const STAGES = [
  { id: 'collect', label: 'Collect', icon: Database, note: 'from assistants' },
  { id: 'distill', label: 'Distill', icon: Sparkles, note: 'local LLM' },
  { id: 'index', label: 'Pre-index', icon: Layers, note: 'embeddings' },
  { id: 'deploy', label: 'Deploy', icon: Rocket, note: 'to Brain' }
] as const

export default function Brain() {
  const { sources, selected, toggleSelected, toast } = useStore()
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [ollamaUrl, setOllamaUrl] = useState('')
  const [checking, setChecking] = useState(true)

  // VRAM profile: which chat model distillation uses. Persisted per user.
  const [profileId, setProfileId] = useState<string>(() => {
    try {
      return localStorage.getItem(PROFILE_KEY) ?? 'standard'
    } catch {
      return 'standard'
    }
  })
  const [pull, setPull] = useState<OllamaPullEvent | null>(null)
  const [justPulled, setJustPulled] = useState<Set<string>>(new Set())

  const activeProfile = VRAM_PROFILES.find((p) => p.id === profileId) ?? VRAM_PROFILES[1]

  function selectProfile(id: string) {
    setProfileId(id)
    try {
      localStorage.setItem(PROFILE_KEY, id)
    } catch {
      /* storage unavailable — selection lives for this session only */
    }
  }

  useEffect(() => api.onOllamaPullProgress(setPull), [])

  async function pullModel(model: string) {
    try {
      await api.ollamaPull(model, ollamaUrl || undefined)
      setJustPulled((s) => new Set(s).add(model))
      toast({ kind: 'success', title: 'Model ready', detail: model })
      void check() // refresh the installed list
    } catch (e) {
      toast({ kind: 'error', title: 'Pull failed', detail: (e as Error).message })
    } finally {
      setPull(null)
    }
  }

  const installed = (m: string) => hasModel(status?.models ?? [], m) || justPulled.has(m)

  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ label: string; pct: number } | null>(null)
  const [result, setResult] = useState<BrainRunResult | null>(null)
  const [importPath, setImportPath] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BrainHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

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
        model: activeProfile.chatModel,
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
      setSearched(true)
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

      {/* Ollama status + VRAM profiles */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Cpu className="h-4 w-4 text-iris" /> Local engine (Ollama)
          </div>
          {status && (
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.reachable ? 'bg-mint' : 'bg-rose'}`} />
              <span className="text-xs text-ink-dim">
                {status.reachable ? `${status.models.length} models installed` : 'offline'}
              </span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-56"
            />
            <Button variant="soft" onClick={() => check()} disabled={checking}>
              {checking ? <Spinner className="h-4 w-4" /> : <Cpu className="h-4 w-4" />}
              Recheck
            </Button>
          </div>
        </div>

        <p className="mb-3 text-xs text-ink-faint">
          Pick the profile matching your GPU — it sets which model distills your chats. Missing models can be pulled
          right here.
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {VRAM_PROFILES.map((p) => {
            const active = p.id === profileId
            const have = installed(p.chatModel)
            const pulling = pull !== null && pull.model === p.chatModel
            const pct = pulling && pull.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : null
            return (
              <button
                key={p.id}
                onClick={() => selectProfile(p.id)}
                className={clsx(
                  'no-drag flex flex-col rounded-2xl border p-3.5 text-left transition-colors',
                  active
                    ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30'
                    : 'border-white/8 bg-black/20 hover:bg-white/5'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-ink">{p.label}</span>
                  <span className="text-[10px] font-medium text-ink-faint">{p.vram} VRAM</span>
                  {p.recommended && <Badge color="#22d3ee">recommended</Badge>}
                  {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-iris" />}
                </div>
                <p className="mt-1.5 min-h-[42px] text-[11px] leading-relaxed text-ink-faint">{p.blurb}</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-cyan">{p.chatModel}</code>
                  <span className="text-[10px] text-ink-faint">{p.chatSize}</span>
                </div>

                {pulling ? (
                  <div className="mt-2.5 space-y-1.5">
                    <ProgressBar value={pct ?? 6} />
                    <div className="flex items-center justify-between text-[10px] text-ink-faint">
                      <span>
                        {pct !== null && pull.total
                          ? `${pct}% · ${((pull.completed ?? 0) / 1e9).toFixed(1)} / ${(pull.total / 1e9).toFixed(1)} GB`
                          : pull.status}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          void api.ollamaPullCancel()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation()
                            void api.ollamaPullCancel()
                          }
                        }}
                        className="cursor-pointer text-rose hover:underline"
                      >
                        cancel
                      </span>
                    </div>
                  </div>
                ) : have ? (
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-mint">
                    <Check className="h-3.5 w-3.5" /> installed
                  </div>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      void pullModel(p.chatModel)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        void pullModel(p.chatModel)
                      }
                    }}
                    className={clsx(
                      'mt-2.5 inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-white/14',
                      pull !== null && 'pointer-events-none opacity-40'
                    )}
                  >
                    <Download className="h-3 w-3" /> Pull model
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Shared embedding model — one for every profile, changing it = full reindex */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-ink-dim">Embedding model (shared)</span>
          <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-cyan">{PROFILE_EMBED_MODEL}</code>
          <span className="text-[10px] text-ink-faint">{PROFILE_EMBED_SIZE}</span>
          {pull?.model === PROFILE_EMBED_MODEL ? (
            <span className="flex min-w-40 flex-1 items-center gap-2">
              <span className="flex-1">
                <ProgressBar
                  value={pull.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : 8}
                />
              </span>
              <span className="text-[10px] text-ink-faint">{pull.status}</span>
            </span>
          ) : installed(PROFILE_EMBED_MODEL) ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-mint">
              <Check className="h-3 w-3" /> installed
            </span>
          ) : (
            <Button
              variant="soft"
              onClick={() => void pullModel(PROFILE_EMBED_MODEL)}
              disabled={pull !== null}
              className="!px-2.5 !py-1 !text-[11px]"
            >
              <Download className="h-3 w-3" /> Pull
            </Button>
          )}
          <span className="ml-auto text-[10px] text-ink-faint">
            same for every profile — switching it would force a full reindex
          </span>
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
            {!!result.garbage && <Badge color="#fb7185">{result.garbage} low-quality → review</Badge>}
            {!!result.skipped && <Badge color="#fbbf24">{result.skipped} skipped (too short)</Badge>}
            <Badge color="#22d3ee">{result.chunks} chunks · dim {result.dim}</Badge>
            <span className="text-xs text-ink-faint">{result.notesDir}</span>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            Distills selected sources with <code className="text-cyan">{activeProfile.chatModel}</code> ({activeProfile.label}{' '}
            profile) and builds a searchable index.
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
          {searched && hits.length === 0 && !searching && (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-xs text-ink-faint">
              No matches. The index only covers distilled notes — run the pipeline above first if you haven't yet.
            </p>
          )}
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
