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
import { relativeTime, sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import { VRAM_PROFILES, PROFILE_EMBED_MODEL, PROFILE_EMBED_SIZE } from '@core/brain/profiles'
import type { BrainHit, BrainStatus, EmbeddedBrainStatus, OllamaPullEvent } from '../lib/types'
import { useStore, ollamaUrlFromBrainUrl, dashboardUrlFromBrainUrl } from '../store/useStore'

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
  const {
    sources,
    selected,
    toggleSelected,
    toast,
    brainRunning,
    brainProgress,
    brainResult,
    brainState,
    brainStateLoading,
    loadBrainState,
    runBrainPipeline,
    cancelBrainPipeline,
    ollamaUrl,
    setOllamaUrl,
    remoteBrainUrl,
    brainTarget,
    brainAutoDeploy,
    setBrainAutoDeploy,
    brainDeployUrl,
    setBrainDeployUrl,
    brainDeployTarget,
    setBrainDeployTarget
  } = useStore()
  const [status, setStatus] = useState<BrainStatus | null>(null)
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

  const [importPath, setImportPath] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BrainHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  // Embedded brain-core (forked local MCP server).
  const [embedded, setEmbedded] = useState<EmbeddedBrainStatus | null>(null)
  const [embeddedBusy, setEmbeddedBusy] = useState(false)
  async function refreshEmbedded() {
    try {
      setEmbedded(await api.brainCoreStatus())
    } catch {
      setEmbedded(null)
    }
  }
  useEffect(() => {
    void refreshEmbedded()
  }, [])
  async function toggleEmbedded() {
    if (embeddedBusy || !embedded) return
    setEmbeddedBusy(true)
    try {
      setEmbedded(embedded.running ? await api.brainCoreStop() : await api.brainCoreStart(ollamaUrl || undefined))
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: 'Embedded brain', detail: (e as Error).message })
      void refreshEmbedded()
    } finally {
      setEmbeddedBusy(false)
    }
  }
  async function reindexEmbedded() {
    if (embeddedBusy) return
    setEmbeddedBusy(true)
    try {
      const r = await api.brainCoreReindex()
      useStore.getState().toast({
        kind: 'success',
        title: 'Local index refreshed',
        detail: `${r.stats.files} notes · ${r.stats.chunks} chunks${r.stats.prunedFiles ? ` · ${r.stats.prunedFiles} pruned` : ''}`
      })
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: 'Reindex failed', detail: (e as Error).message })
    } finally {
      setEmbeddedBusy(false)
      void refreshEmbedded()
    }
  }

  // Honest pipeline state — live chats vs the distill ledger (global store).
  useEffect(() => {
    void loadBrainState()
  }, [loadBrainState])

  const [deployUrl, setDeployUrlLocal] = useState(brainDeployUrl)
  const [reindex, setReindex] = useState(true)
  const [deploying, setDeploying] = useState(false)
  const [deployMsg, setDeployMsg] = useState('')

  async function check(url?: string) {
    setChecking(true)
    const candidates = [
      url,
      ollamaUrl || undefined,
      remoteBrainUrl ? ollamaUrlFromBrainUrl(remoteBrainUrl) : undefined,
      undefined
    ].filter((u, i, a) => u === undefined || a.indexOf(u) === i) as (string | undefined)[]

    let best: BrainStatus | null = null
    for (const candidate of candidates) {
      const s = await api.brainStatus(candidate)
      if (s.reachable) {
        best = s
        if (candidate && candidate !== ollamaUrl) setOllamaUrl(candidate)
        else if (!ollamaUrl && s.baseUrl) setOllamaUrl(s.baseUrl)
        break
      }
      if (!best) best = s
    }
    setStatus(best)
    setChecking(false)
  }
  useEffect(() => {
    void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const distillable = sources.filter((s) => ['claude-code', 'cursor', 'claude-desktop'].includes(s.id))

  function run(pendingOnly = false) {
    const sel = [...selected].filter((id) => distillable.some((d) => d.id === id))
    void runBrainPipeline({
      sources: sel.length ? sel : distillable.map((d) => d.id),
      model: activeProfile.chatModel,
      ollamaUrl,
      importPath: importPath || undefined,
      pendingOnly
    })
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
    if (!brainRunning && brainResult) return 'done'
    if (brainRunning && brainProgress) {
      if (id === 'collect') return 'done'
      if (brainProgress.label.startsWith('distill')) return id === 'distill' ? 'active' : id === 'collect' ? 'done' : 'idle'
      if (brainProgress.label.startsWith('index')) return id === 'index' ? 'active' : id === 'deploy' ? 'idle' : 'done'
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

      {/* Brain state — live chats vs distill ledger, the "what's left to do" panel */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Database className="h-4 w-4 text-iris" /> Brain state
          </div>
          <div className="flex items-center gap-3">
            {brainState?.lastRun && (
              <span className="text-[11px] text-ink-faint">last distill {relativeTime(brainState.lastRun)}</span>
            )}
            <Button variant="ghost" onClick={() => void loadBrainState()} disabled={brainStateLoading} className="!px-2 !py-1">
              {brainStateLoading ? <Spinner className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5 rotate-90" />}
            </Button>
          </div>
        </div>
        {brainState === null ? (
          <div className="flex items-center gap-2 py-1 text-sm text-ink-dim">
            <Spinner className="h-4 w-4" /> reading pipeline state…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Chats in tools</div>
                <div className="mt-1 text-2xl font-bold text-ink">{brainState.total}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Distilled</div>
                <div className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold text-ink">
                  {brainState.distilled}
                  {brainState.pending === 0 && brainState.total > 0 && <Check className="h-4 w-4 text-mint" />}
                </div>
              </div>
              <div
                className={`rounded-2xl border p-3.5 ${
                  brainState.pending > 0 ? 'border-amber/30 bg-amber/8' : 'border-white/8 bg-black/20'
                }`}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">Backlog</div>
                <div className={`mt-1 text-2xl font-bold ${brainState.pending > 0 ? 'text-amber' : 'text-ink'}`}>
                  {brainState.pending}
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {brainState.perSource.map((p) => {
                const m = sourceMeta(p.source)
                return (
                  <span
                    key={p.source}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px]"
                  >
                    <span style={{ color: m.color }}>{p.label}</span>
                    <span className="text-ink-faint">
                      {p.total - p.pending}/{p.total}
                    </span>
                    {p.pending > 0 && <span className="font-medium text-amber">+{p.pending} new</span>}
                  </span>
                )
              })}
              {brainState.pending > 0 && (
                <Button
                  onClick={() => run(true)}
                  disabled={brainRunning || !status?.reachable}
                  className="ml-auto !px-3.5 !py-1.5 !text-[12px]"
                >
                  {brainRunning ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Distill backlog ({brainState.pending})
                </Button>
              )}
              {brainRunning && (
                <Button variant="soft" onClick={cancelBrainPipeline} className="!px-3 !py-1.5 !text-[12px]">
                  Cancel
                </Button>
              )}
            </div>
            {brainRunning && brainProgress && (
              <div className="mt-3 space-y-1.5">
                <div className="text-xs text-ink-dim">{brainProgress.label}</div>
                <ProgressBar value={brainProgress.pct || 6} />
              </div>
            )}
          </>
        )}
      </GlassCard>

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
              onBlur={() => void check()}
              placeholder={remoteBrainUrl ? ollamaUrlFromBrainUrl(remoteBrainUrl) : 'http://localhost:11434'}
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

      {/* Embedded brain — forked brain-core serving MCP on localhost */}
      <GlassCard className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Rocket className="h-4 w-4 text-violet" /> Embedded brain
            <Badge color="#8b5cf6">local MCP</Badge>
          </div>
          {embedded?.running ? (
            <span className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-mint" />
              </span>
              <code className="font-mono text-[11px] text-cyan">{embedded.url}</code>
            </span>
          ) : (
            <span className="text-xs text-ink-faint">
              {embedded?.lastError ? `stopped — ${embedded.lastError}` : 'stopped'}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {embedded?.running && (
              <Button variant="soft" onClick={() => void reindexEmbedded()} disabled={embeddedBusy || embedded.indexing}>
                {embedded.indexing || embeddedBusy ? <Spinner className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                Reindex
              </Button>
            )}
            <Button onClick={() => void toggleEmbedded()} disabled={embeddedBusy || embedded?.starting}>
              {embeddedBusy || embedded?.starting ? <Spinner className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
              {embedded?.running ? 'Stop' : 'Start'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          Runs brain-core as a child process — MCP clients on this machine (Claude Code, Cursor…) get{' '}
          <code className="text-cyan">search_library</code> / <code className="text-cyan">save_conversation</code> from{' '}
          <code className="text-cyan">127.0.0.1</code> without any server. Distill runs refresh its index automatically.
        </p>
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
        {brainRunning && brainProgress ? (
          <div className="space-y-2">
            <div className="text-sm text-ink-dim">{brainProgress.label}</div>
            <ProgressBar value={brainProgress.pct} />
          </div>
        ) : brainResult ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="#34d399">{brainResult.notes} notes</Badge>
            <Badge color="#9aa3bd">{brainResult.stubs} stubs</Badge>
            {!!brainResult.garbage && <Badge color="#fb7185">{brainResult.garbage} low-quality → review</Badge>}
            {!!brainResult.skipped && <Badge color="#fbbf24">{brainResult.skipped} skipped (too short)</Badge>}
            {!!brainResult.failed && <Badge color="#fbbf24">{brainResult.failed} timed out</Badge>}
            {!!brainResult.reindexed && <Badge color="#34d399">deployed + reindexed</Badge>}
            {brainResult.deployed != null && brainResult.deployed > 0 && !brainResult.reindexed && (
              <Badge color="#fbbf24">{brainResult.deployed} deployed</Badge>
            )}
            <Badge color="#22d3ee">{brainResult.chunks} chunks · dim {brainResult.dim}</Badge>
            <span className="text-xs text-ink-faint">{brainResult.notesDir}</span>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            Distills selected sources with <code className="text-cyan">{activeProfile.chatModel}</code> ({activeProfile.label}{' '}
            profile) and builds a searchable index.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => run()} disabled={brainRunning || !status?.reachable}>
            {brainRunning ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            Run pipeline
          </Button>
          {brainRunning && (
            <Button variant="soft" onClick={cancelBrainPipeline}>
              Cancel
            </Button>
          )}
          <Button
            variant="soft"
            disabled={brainRunning}
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

      {/* Deploy — remote Brain (KVM) receives notes after distill when auto-deploy is on */}
      <GlassCard className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          <Rocket className="h-4 w-4 text-violet" /> Deploy to Brain
          {brainTarget === 'remote' && (
            <Badge color="#8b5cf6">remote KVM</Badge>
          )}
        </div>
        {brainTarget === 'remote' && (
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setBrainAutoDeploy(!brainAutoDeploy)}
              className="no-drag flex items-center gap-2 text-sm text-ink-dim"
            >
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${brainAutoDeploy ? 'accent-grad' : 'bg-white/12'}`}
              >
                <motion.span
                  layout
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
                  style={{ left: brainAutoDeploy ? 18 : 2 }}
                />
              </span>
              Auto-deploy after distill
            </button>
            <span className="text-[11px] text-ink-faint">
              Distill on client GPU → push notes → Brain embeds with <code className="text-cyan">nomic-embed-text</code>
            </span>
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-ink-dim">Dashboard URL</span>
          <Input
            value={deployUrl}
            onChange={(e) => {
              setDeployUrlLocal(e.target.value)
              setBrainDeployUrl(e.target.value)
            }}
            placeholder={dashboardUrlFromBrainUrl(remoteBrainUrl)}
            className="w-64"
          />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-ink-dim">Distilled folder (optional SMB)</span>
          <Input
            value={brainDeployTarget}
            onChange={(e) => setBrainDeployTarget(e.target.value)}
            placeholder="\\\\host\\share\\brain\\vault\\distilled"
            className="min-w-64 flex-1"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            Push raw chats
          </Button>
        </div>
        {deployMsg && <p className="mt-3 text-xs text-mint">{deployMsg}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          Local <code className="text-cyan">brain-notes</code> is a staging dir. With <strong className="font-medium text-ink-dim">Remote master</strong>,
          auto-deploy copies finished notes to your KVM (SMB folder preferred) and triggers{' '}
          <code className="text-cyan">library/reindex</code> — only <code className="text-cyan">nomic-embed-text</code> (~274 MB) runs on the server.
        </p>
      </GlassCard>
    </div>
  )
}
