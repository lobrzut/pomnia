// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
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
  Square,
  Stethoscope,
  Upload,
  User,
  X
} from 'lucide-react'
import clsx from 'clsx'
import { Badge, Button, GlassCard, Input, ProgressBar, Spinner } from '../components/ui'
import { relativeTime, sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import { VRAM_PROFILES, PROFILE_EMBED_MODEL, PROFILE_EMBED_SIZE } from '@core/brain/profiles'
import { isDistillableSource } from '@core/brain/distillSources'
import type { BrainHit, BrainStatus, EmbeddedBrainStatus, OllamaPullEvent, QuarantineBucket, QuarantineNoteMeta } from '../lib/types'
import { uiLabels } from '../lib/labels'
import { useStore, ollamaUrlFromBrainUrl, dashboardUrlFromBrainUrl } from '../store/useStore'
import { ActivityBanner } from '../components/ActivityBanner'

const PROFILE_KEY = 'pomnia.brain.profile'

/** "qwen2.5:14b" and "qwen2.5:14b" match; "nomic-embed-text" matches "nomic-embed-text:latest". */
function hasModel(models: string[], want: string): boolean {
  return models.some((m) => m === want || m === `${want}:latest` || m.replace(/:latest$/, '') === want)
}

const STAGE_ICONS = {
  collect: Database,
  distill: Sparkles,
  index: Layers,
  deploy: Rocket
} as const

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
    setBrainDeployTarget,
    brainDeployReindex,
    setBrainDeployReindex,
    simpleMode,
    vault
  } = useStore()
  const labels = uiLabels()
  const [advancedOpen, setAdvancedOpen] = useState(!simpleMode)
  const showAdvanced = !simpleMode || advancedOpen
  /** Simple mode is always embedded; remote-only UI only when advanced + remote target. */
  const isRemoteTarget = !simpleMode && brainTarget === 'remote'
  const allPipelineStages = [
    { id: 'collect' as const, label: labels.brainPipeCollect, note: labels.brainPipeCollectNote, icon: STAGE_ICONS.collect },
    { id: 'distill' as const, label: labels.brainPipeDistill, note: labels.brainPipeDistillNote, icon: STAGE_ICONS.distill },
    { id: 'index' as const, label: labels.brainPipeIndex, note: labels.brainPipeIndexNote, icon: STAGE_ICONS.index },
    { id: 'deploy' as const, label: labels.brainPipeDeploy, note: labels.brainPipeDeployNote, icon: STAGE_ICONS.deploy }
  ]
  const pipelineStages = isRemoteTarget
    ? allPipelineStages
    : allPipelineStages.filter((s) => s.id !== 'deploy')
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

  useEffect(() => {
    setAdvancedOpen(!simpleMode)
  }, [simpleMode])

  useEffect(() => api.onOllamaPullProgress(setPull), [])

  async function pullModel(model: string) {
    try {
      await api.ollamaPull(model, ollamaUrl || undefined)
      setJustPulled((s) => new Set(s).add(model))
      toast({ kind: 'success', title: labels.toastModelReady, detail: model })
      void check() // refresh the installed list
    } catch (e) {
      toast({ kind: 'error', title: labels.toastPullFailed, detail: (e as Error).message })
    } finally {
      setPull(null)
    }
  }

  const installed = (m: string) => hasModel(status?.models ?? [], m) || justPulled.has(m)

  const [importPath, setImportPath] = useState<string | null>(null)
  const [doctorBusy, setDoctorBusy] = useState(false)
  const [doctorText, setDoctorText] = useState<string | null>(null)
  const [doctorExit, setDoctorExit] = useState<0 | 1 | null>(null)

  async function runDoctorCheck() {
    if (doctorBusy) return
    setDoctorBusy(true)
    try {
      const report = await api.doctorRun({
        distillModel: activeProfile.chatModel,
        ollamaUrl: ollamaUrl || undefined,
      })
      const lines = report.checks.map((c) => {
        const action = c.action && c.level !== 'OK' ? ` — ${c.action}` : ''
        return `${c.level} ${c.message}${action}`
      })
      lines.push(`${report.ok} OK · ${report.warn} WARN · ${report.fail} FAIL`)
      setDoctorText(lines.join('\n'))
      setDoctorExit(report.exitCode)
    } catch (e) {
      setDoctorText(`FAIL doctor ${(e as Error).message}`)
      setDoctorExit(1)
      toast({ kind: 'error', title: labels.brainDoctorTitle, detail: (e as Error).message })
    } finally {
      setDoctorBusy(false)
    }
  }

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BrainHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  // Embedded brain-core (forked local MCP server).
  const [embedded, setEmbedded] = useState<EmbeddedBrainStatus | null>(null)
  const [embeddedBusy, setEmbeddedBusy] = useState(false)
  const [embeddedStopping, setEmbeddedStopping] = useState(false)
  async function refreshEmbedded() {
    try {
      setEmbedded(await api.brainCoreStatus())
    } catch {
      setEmbedded(null)
    }
  }
  useEffect(() => {
    void refreshEmbedded()
    return api.onBrainCoreEvent((e) => {
      if (
        e.type === 'reindex-progress' ||
        e.type === 'index-progress' ||
        e.type === 'exited' ||
        e.type === 'ready'
      ) {
        void refreshEmbedded()
      }
    })
  }, [])
  async function startEmbedded() {
    if (embeddedBusy || embeddedStopping || embedded?.running || embedded?.starting) return
    setEmbeddedBusy(true)
    try {
      setEmbedded(await api.brainCoreStart(ollamaUrl || undefined))
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: labels.embeddedBrain, detail: (e as Error).message })
      void refreshEmbedded()
    } finally {
      setEmbeddedBusy(false)
    }
  }
  /** Always available while running — including mid-reindex (aborts indexer). */
  async function stopEmbedded() {
    if (embeddedStopping || (!embedded?.running && !embedded?.starting && !embedded?.indexing)) return
    setEmbeddedStopping(true)
    try {
      setEmbedded(await api.brainCoreStop())
      useStore.getState().toast({ kind: 'info', title: labels.embeddedBrainStoppedToast })
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: labels.embeddedBrain, detail: (e as Error).message })
      void refreshEmbedded()
    } finally {
      setEmbeddedStopping(false)
      setEmbeddedBusy(false)
    }
  }
  async function reindexEmbedded() {
    if (embeddedBusy || embeddedStopping || embedded?.indexing) return
    setEmbeddedBusy(true)
    try {
      const r = await api.brainCoreReindex()
      useStore.getState().toast({
        kind: 'success',
        title: labels.toastLocalIndexRefreshed,        detail: `${r.stats.files} notes · ${r.stats.chunks} chunks${r.stats.prunedFiles ? ` · ${r.stats.prunedFiles} pruned` : ''}`
      })
    } catch (e) {
      const msg = (e as Error).message
      if (/abort|stopped/i.test(msg)) {
        useStore.getState().toast({ kind: 'info', title: labels.embeddedBrainStoppedToast, detail: msg })
      } else {
        useStore.getState().toast({ kind: 'error', title: labels.toastReindexFailed, detail: msg })
      }
    } finally {
      setEmbeddedBusy(false)
      void refreshEmbedded()
    }
  }

  // Honest pipeline state — live chats vs the distill ledger (global store).
  useEffect(() => {
    void loadBrainState()
  }, [loadBrainState])

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

  const distillable = sources.filter((s) => isDistillableSource(s.id))

  /** Default pending-only — omitting the arg must never silently re-distill everything. */
  function run(pendingOnly = true) {
    const sel = [...selected].filter((id) => distillable.some((d) => d.id === id))
    void runBrainPipeline({
      sources: sel.length ? sel : distillable.map((d) => d.id),
      model: activeProfile.chatModel,
      ollamaUrl,
      importPath: importPath || undefined,
      pendingOnly
    })
  }

  function runFullRedistill() {
    const n = brainState?.total ?? 0
    if (!window.confirm(labels.redistillEverythingConfirm(n))) return
    run(false)
  }

  async function search() {
    if (!query) return
    setSearching(true)
    try {
      setHits(await api.brainSearch(query, ollamaUrl))
      setSearched(true)
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: labels.toastSearchFailed, detail: (e as Error).message })
    } finally {
      setSearching(false)
    }
  }

  async function deploy(to: 'filesystem' | 'dashboard') {
    setDeploying(true)
    try {
      let target: string | undefined
      if (to === 'filesystem') {
        target = brainDeployTarget || (await api.pickDirectory()) || undefined
        if (!target) return
        if (target !== brainDeployTarget) setBrainDeployTarget(target)
      }
      const r = await api.brainDeploy({
        to,
        target,
        url: brainDeployUrl,
        reindex: brainDeployReindex,
        sources: distillable.map((d) => d.id)
      })
      setDeployMsg(r.detail)
      useStore.getState().toast({ kind: 'success', title: labels.toastDeployed, detail: r.detail })
    } catch (e) {
      useStore.getState().toast({ kind: 'error', title: labels.toastDeployFailed, detail: (e as Error).message })
    } finally {
      setDeploying(false)
    }
  }

  const stageState = (id: string): 'idle' | 'active' | 'done' => {
    if (!brainRunning && brainResult) return 'done'
    if (brainRunning && brainProgress) {
      if (id === 'collect') return 'done'
      const phase = brainProgress.phase
      if (phase === 'distill') return id === 'distill' ? 'active' : id === 'collect' ? 'done' : 'idle'
      if (phase === 'index' || phase === 'embed') return id === 'index' ? 'active' : id === 'deploy' ? 'idle' : 'done'
      if (phase === 'deploy') return id === 'deploy' ? 'active' : 'done'
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
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.brainPageTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.brainPageLead}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {vault.open
              ? labels.knowledgePathOpen(vault.path ?? vault.name ?? '')
              : labels.knowledgePathLocked}
          </p>
        </div>
      </div>

      {simpleMode && (
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="no-drag mb-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 text-left text-sm font-medium text-ink-dim transition-colors hover:bg-white/5"
        >
          <span>{labels.advanced}</span>
          <span className="text-[11px] text-ink-faint">{advancedOpen ? '▲' : '▼'}</span>
        </button>
      )}

      {/* Brain state — live chats vs distill ledger, the "what's left to do" panel */}
      <GlassCard className="mb-5 p-5">
        <ActivityBanner className="mb-3 !rounded-xl !border-amber/30 !bg-amber/8" />
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Database className="h-4 w-4 text-iris" /> {labels.brainStateTitle}
          </div>
          <div className="flex items-center gap-3">
            {brainState?.lastRun && (
              <span className="text-[11px] text-ink-faint">
                {labels.brainStateLastDistill(relativeTime(brainState.lastRun))}
              </span>
            )}
            <Button variant="ghost" onClick={() => void loadBrainState()} disabled={brainStateLoading} className="!px-2 !py-1">
              {brainStateLoading ? <Spinner className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5 rotate-90" />}
            </Button>
            <Button
              variant="soft"
              onClick={() => void runDoctorCheck()}
              disabled={doctorBusy}
              className="!px-2.5 !py-1 text-[11px]"
            >
              {doctorBusy ? (
                <>
                  <Spinner className="h-3.5 w-3.5" /> {labels.brainDoctorRunning}
                </>
              ) : (
                <>
                  <Stethoscope className="h-3.5 w-3.5" /> {labels.brainDoctorRun}
                </>
              )}
            </Button>
          </div>
        </div>
        {doctorText && (
          <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-ink-dim">
              <span>{labels.brainDoctorTitle}</span>
              {doctorExit != null && (
                <span className={doctorExit === 0 ? 'text-mint' : 'text-rose'}>
                  exit {doctorExit}
                </span>
              )}
            </div>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
              {doctorText.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('FAIL')
                      ? 'text-rose'
                      : line.startsWith('WARN')
                        ? 'text-amber'
                        : line.startsWith('OK')
                          ? 'text-mint'
                          : 'text-ink'
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          </div>
        )}
        {brainState === null ? (
          <div className="flex items-center gap-2 py-1 text-sm text-ink-dim">
            <Spinner className="h-4 w-4" /> {labels.brainStateLoading}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                  {labels.brainStateChatsInTools}
                </div>
                <div className="mt-1 text-2xl font-bold text-ink">{brainState.total}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-3.5">
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                  {labels.brainStateDistilled}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5 text-2xl font-bold text-ink">
                  {brainState.distilled}
                  {brainState.pending === 0 &&
                    !brainState.pendingPartial &&
                    brainState.total > 0 && <Check className="h-4 w-4 text-mint" />}
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-ink-faint">
                  {labels.brainStateDistilledHint}
                  {typeof vault.distilledNotes === 'number' && vault.distilledNotes > 0
                    ? ` · ${labels.brainStateVaultNotes(vault.distilledNotes)}`
                    : ''}
                </div>
              </div>
              <div
                className={`rounded-2xl border p-3.5 ${
                  brainState.pending > 0 || brainState.pendingPartial
                    ? 'border-amber/30 bg-amber/8'
                    : 'border-white/8 bg-black/20'
                }`}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                  {labels.brainStateBacklog}
                </div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    brainState.pending > 0 || brainState.pendingPartial ? 'text-amber' : 'text-ink'
                  }`}
                >
                  {brainState.pendingPartial && brainState.pending === 0
                    ? '—'
                    : brainState.pendingPartial
                      ? `${brainState.pending}+`
                      : brainState.pending}
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
                      {p.pending == null
                        ? `—/${p.total || '—'}`
                        : `${p.total - p.pending}/${p.total}`}
                    </span>
                    {p.pending == null && (
                      <span className="text-amber/90" title={labels.brainStateUncountable}>
                        {labels.brainStateUncountable}
                      </span>
                    )}
                    {p.pending != null && p.pending > 0 && (
                      <span className="font-medium text-amber">{labels.brainStatePendingNew(p.pending)}</span>
                    )}
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
                  {labels.distillBacklog(brainState.pending)}
                </Button>
              )}
              {brainRunning && (
                <Button variant="soft" onClick={cancelBrainPipeline} className="!px-3 !py-1.5 !text-[12px]">
                  {labels.cancel}
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

      {/* Pipeline stages — full mode only (hidden in simpleMode; duplicates Backup i do Brain) */}
      {!simpleMode && (
      <GlassCard className="mb-5 flex items-center justify-between p-5">
        {pipelineStages.map((s, i) => {
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
              {i < pipelineStages.length - 1 && (
                <div className="mx-2 h-px flex-1 bg-gradient-to-r from-white/20 to-white/5" />
              )}
            </div>
          )
        })}
      </GlassCard>
      )}

      {/* Ollama status + VRAM profiles — advanced only */}
      {showAdvanced && (
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
      )}

      {/* Embedded brain — forked brain-core serving MCP on localhost */}
      <GlassCard className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Rocket className="h-4 w-4 text-mint" /> {labels.embeddedBrain}
            <Badge color="#34d399">local MCP</Badge>
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
            <Button
              variant="soft"
              className="!px-2.5 !py-1.5 !text-[11px]"
              onClick={() => void api.profilePreviewShow()}
            >
              <User className="h-3.5 w-3.5" />
              {labels.profilePreview}
            </Button>
            {embedded?.running && showAdvanced && (
              <Button
                variant="soft"
                onClick={() => void reindexEmbedded()}
                disabled={embeddedBusy || embeddedStopping || embedded.indexing}
              >
                {embedded.indexing || embeddedBusy ? <Spinner className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
                {labels.reindex}
              </Button>
            )}
            {embedded?.running || embedded?.starting || embedded?.indexing ? (
              <Button variant="soft" onClick={() => void stopEmbedded()} disabled={embeddedStopping}>
                {embeddedStopping ? <Spinner className="h-4 w-4" /> : <Square className="h-3.5 w-3.5 fill-current" />}
                {labels.embeddedBrainStop}
              </Button>
            ) : (
              <Button onClick={() => void startEmbedded()} disabled={embeddedBusy || embeddedStopping}>
                {embeddedBusy ? <Spinner className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                {labels.embeddedBrainStart}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          {labels.brainEmbeddedProcessHint}
        </p>
      </GlassCard>

      {/* Run */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">
            {showAdvanced ? labels.brainAdvancedDistillTitle : labels.distill}
          </span>
          {showAdvanced && <span className="text-xs text-ink-faint">{labels.brainAdvancedOllamaNeed}</span>}
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
                  color: on ? '#060a08' : m.color,
                  background: on ? '#34d399' : `${m.color}14`,
                  borderColor: on ? '#34d399aa' : `${m.color}55`
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
            {labels.brainDistillSelectedHint(activeProfile.chatModel, activeProfile.label)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={runFullRedistill} disabled={brainRunning || !status?.reachable} variant="soft">
            {brainRunning ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {labels.runPipeline}
          </Button>
          {brainRunning && (
            <Button variant="soft" onClick={cancelBrainPipeline}>
              {labels.cancel}
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
            <Upload className="h-4 w-4" /> {labels.brainAttachExport}
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
            {labels.brainAttachExportHint}
          </p>
        )}
      </GlassCard>

      {/* Quarantine / weak notes — user promote only */}
      <QuarantinePanel vaultOpen={!!vault.open} />

      {/* Search */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Search className="h-4 w-4 text-cyan" /> {labels.searchKnowledge}
        </div>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder={labels.brainSearchPlaceholder}
          />
          <Button onClick={search} disabled={searching || !query}>
            {searching ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            {labels.brainSearchButton}
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {searched && hits.length === 0 && !searching && (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-4 text-center text-xs text-ink-faint">
              {labels.brainSearchEmpty}
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

      {/* Deploy — remote Brain (KVM) only; never in simple/embedded */}
      {isRemoteTarget && (
      <GlassCard className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          <Rocket className="h-4 w-4 text-mint" /> {labels.deployToBrain}
          <Badge color="#34d399">remote KVM</Badge>
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-ink-dim">{labels.remoteDeployLead}</p>
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
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-ink-dim">Dashboard URL</span>
          <Input
            value={brainDeployUrl}
            onChange={(e) => setBrainDeployUrl(e.target.value)}
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
          <button
            onClick={() => setBrainDeployReindex(!brainDeployReindex)}
            className="no-drag flex items-center gap-2 text-sm text-ink-dim"
          >
            <span
              className={`relative h-5 w-9 rounded-full transition-colors ${brainDeployReindex ? 'accent-grad' : 'bg-white/12'}`}
            >
              <motion.span
                layout
                className="absolute top-0.5 h-4 w-4 rounded-full bg-white"
                style={{ left: brainDeployReindex ? 18 : 2 }}
              />
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
      )}
    </div>
  )
}

function noteKey(bucket: QuarantineBucket, name: string): string {
  return `${bucket}:${name}`
}

/** Pull gate-rejection fields from YAML frontmatter (first --- block). */
function parseQuarantineFrontmatter(content: string): { quality: string | null; msgCount: string | null } {
  if (!content.startsWith('---')) return { quality: null, msgCount: null }
  const end = content.indexOf('\n---', 3)
  if (end < 0) return { quality: null, msgCount: null }
  const fm = content.slice(4, end)
  return {
    quality: fm.match(/^quality:\s*(\S+)/m)?.[1] ?? null,
    msgCount: fm.match(/^msg_count:\s*(\S+)/m)?.[1] ?? null
  }
}

function noteMatchesFilter(n: QuarantineNoteMeta, q: string): boolean {
  if (!q) return true
  return n.name.toLowerCase().includes(q)
}

function QuarantinePanel({ vaultOpen }: { vaultOpen: boolean }) {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [review, setReview] = useState<QuarantineNoteMeta[]>([])
  const [weak, setWeak] = useState<QuarantineNoteMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<{ bucket: QuarantineBucket; name: string; content: string } | null>(
    null
  )
  const [busyName, setBusyName] = useState<string | null>(null)
  const [busyKind, setBusyKind] = useState<'promote' | 'delete' | null>(null)
  const [busyDeleteAll, setBusyDeleteAll] = useState(false)
  const [weakOpen, setWeakOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loadingView, setLoadingView] = useState(false)
  const [listFilter, setListFilter] = useState('')

  const filterQ = listFilter.trim().toLowerCase()
  const filteredReview = useMemo(() => review.filter((n) => noteMatchesFilter(n, filterQ)), [review, filterQ])
  const filteredWeak = useMemo(() => weak.filter((n) => noteMatchesFilter(n, filterQ)), [weak, filterQ])

  const navItems = useMemo(() => {
    const items: QuarantineNoteMeta[] = [...filteredReview]
    if (weakOpen) items.push(...filteredWeak)
    return items
  }, [filteredReview, filteredWeak, weakOpen])

  // Clear master-detail selection when the selected note is filtered out.
  useEffect(() => {
    if (!selectedKey) return
    const stillVisible = navItems.some((n) => noteKey(n.bucket, n.name) === selectedKey)
    if (!stillVisible) {
      setSelectedKey(null)
      setViewing(null)
    }
  }, [navItems, selectedKey])

  async function refresh() {
    if (!vaultOpen) {
      setReview([])
      setWeak([])
      setViewing(null)
      setSelectedKey(null)
      setListFilter('')
      return
    }
    setLoading(true)
    try {
      const r = await api.distilledQuarantineList()
      setReview(r.review)
      setWeak(r.weak)
      setSelectedKey((prev) => {
        if (!prev) return null
        const stillThere = [...r.review, ...r.weak].some((n) => noteKey(n.bucket, n.name) === prev)
        return stillThere ? prev : null
      })
      setViewing((prev) => {
        if (!prev) return null
        const stillThere = [...r.review, ...r.weak].some(
          (n) => n.bucket === prev.bucket && n.name === prev.name
        )
        return stillThere ? prev : null
      })
    } catch {
      setReview([])
      setWeak([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [vaultOpen])

  async function selectNote(bucket: QuarantineBucket, name: string) {
    setSelectedKey(noteKey(bucket, name))
    setLoadingView(true)
    try {
      const { content } = await api.distilledQuarantineRead(bucket, name)
      setViewing({ bucket, name, content })
    } catch (e) {
      toast({ kind: 'error', title: labels.quarantinePromoteFailed, detail: (e as Error).message })
      setViewing(null)
    } finally {
      setLoadingView(false)
    }
  }

  async function promote(bucket: QuarantineBucket, name: string) {
    setBusyName(name)
    setBusyKind('promote')
    try {
      await api.distilledQuarantinePromote(bucket, name)
      toast({ kind: 'success', title: labels.quarantinePromotedToast(name) })
      if (viewing?.name === name && viewing.bucket === bucket) {
        setViewing(null)
        setSelectedKey(null)
      }
      await refresh()
    } catch (e) {
      toast({ kind: 'error', title: labels.quarantinePromoteFailed, detail: (e as Error).message })
    } finally {
      setBusyName(null)
      setBusyKind(null)
    }
  }

  async function removeNote(bucket: QuarantineBucket, name: string) {
    if (!window.confirm(labels.quarantineDeleteConfirm(name))) return
    setBusyName(name)
    setBusyKind('delete')
    try {
      await api.distilledQuarantineDelete(bucket, name)
      toast({ kind: 'success', title: labels.quarantineDeletedToast(name) })
      if (viewing?.name === name && viewing.bucket === bucket) {
        setViewing(null)
        setSelectedKey(null)
      }
      await refresh()
    } catch (e) {
      toast({ kind: 'error', title: labels.quarantineDeleteFailed, detail: (e as Error).message })
    } finally {
      setBusyName(null)
      setBusyKind(null)
    }
  }

  async function removeAllListedReview() {
    const names = filteredReview.map((n) => n.name)
    if (names.length === 0) return
    if (!window.confirm(labels.quarantineDeleteAllConfirm(names.length))) return
    setBusyDeleteAll(true)
    try {
      const r = await api.distilledQuarantineDeleteReview(names)
      if (r.deleted.length > 0) {
        toast({ kind: 'success', title: labels.quarantineDeletedAllToast(r.deleted.length) })
      }
      if (r.failed.length > 0) {
        toast({
          kind: 'error',
          title: labels.quarantineDeleteAllFailed,
          detail: r.failed.slice(0, 5).join(', '),
        })
      }
      setViewing(null)
      setSelectedKey(null)
      await refresh()
    } catch (e) {
      toast({ kind: 'error', title: labels.quarantineDeleteAllFailed, detail: (e as Error).message })
    } finally {
      setBusyDeleteAll(false)
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (navItems.length === 0) return
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    e.preventDefault()
    const idx = navItems.findIndex((n) => noteKey(n.bucket, n.name) === selectedKey)
    if (e.key === 'Enter') {
      const cur = idx >= 0 ? navItems[idx] : navItems[0]
      if (cur) void selectNote(cur.bucket, cur.name)
      return
    }
    const nextIdx =
      e.key === 'ArrowDown'
        ? Math.min((idx < 0 ? -1 : idx) + 1, navItems.length - 1)
        : Math.max((idx < 0 ? navItems.length : idx) - 1, 0)
    const next = navItems[nextIdx]
    if (next) void selectNote(next.bucket, next.name)
  }

  function renderRow(n: QuarantineNoteMeta) {
    const key = noteKey(n.bucket, n.name)
    const sel = selectedKey === key
    return (
      <button
        key={key}
        id={`quarantine-row-${key}`}
        type="button"
        role="option"
        aria-selected={sel}
        onClick={() => void selectNote(n.bucket, n.name)}
        className={clsx(
          'no-drag block w-full rounded-lg border px-2.5 py-1.5 text-left transition-colors',
          sel ? 'border-iris/40 bg-iris/10' : 'border-white/8 bg-black/20 hover:bg-white/8'
        )}
      >
        <span className="block truncate text-xs text-ink">{n.name}</span>
      </button>
    )
  }

  const meta = viewing ? parseQuarantineFrontmatter(viewing.content) : null

  return (
    <GlassCard className="mb-5 p-5">
      <div className="mb-1 text-sm font-semibold text-ink">
        {vaultOpen && !loading ? labels.quarantineHeader(review.length) : labels.quarantineTitle}
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-dim">{labels.quarantineLead}</p>
      {!vaultOpen ? (
        <p className="text-xs text-ink-faint">{labels.quarantineVaultClosed}</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-ink-dim">
          <Spinner className="h-3.5 w-3.5" /> {labels.statusChecking}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
          {/* List — quarantine first; _weak behind disclosure */}
          <div className="min-w-0">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={listFilter}
                onChange={(e) => setListFilter(e.target.value)}
                placeholder={labels.quarantineSearchPlaceholder}
                className="!py-1.5 !pl-8 !text-xs"
                aria-label={labels.quarantineSearchPlaceholder}
              />
            </div>
            {filteredReview.length > 0 ? (
              <div className="mb-2 flex justify-end">
                <Button
                  variant="danger"
                  className="!px-2.5 !py-1 !text-[11px]"
                  disabled={busyDeleteAll || busyName != null}
                  onClick={() => void removeAllListedReview()}
                >
                  {busyDeleteAll ? <Spinner className="h-3 w-3" /> : null}
                  {labels.quarantineDeleteAll}
                </Button>
              </div>
            ) : null}
            <div
              className="max-h-[60vh] space-y-1 overflow-y-auto pr-1"
              role="listbox"
              tabIndex={0}
              aria-label={labels.quarantineHeader(review.length)}
              aria-activedescendant={selectedKey ? `quarantine-row-${selectedKey}` : undefined}
              onKeyDown={onListKeyDown}
            >
              {review.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-ink-faint">{labels.quarantineEmpty}</p>
              ) : filteredReview.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-ink-faint">{labels.quarantineNoMatches}</p>
              ) : (
                filteredReview.map(renderRow)
              )}
              {weak.length > 0 ? (
                <div className="pt-1">
                  <button
                    type="button"
                    className="no-drag flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-ink-faint hover:bg-white/6 hover:text-ink-dim"
                    aria-expanded={weakOpen}
                    onClick={() => setWeakOpen((o) => !o)}
                  >
                    <span className="min-w-0 flex-1 truncate">{labels.quarantineWeakToggle(weak.length)}</span>
                    <span aria-hidden="true">{weakOpen ? '▴' : '▾'}</span>
                  </button>
                  {weakOpen ? (
                    <div className="mt-1 space-y-1">
                      {filteredWeak.length === 0 ? (
                        <p className="px-1 py-1 text-[11px] text-ink-faint">{labels.quarantineNoMatches}</p>
                      ) : (
                        filteredWeak.map(renderRow)
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Reader */}
          <div
            className="min-w-0 rounded-xl border border-white/10 bg-black/40"
            aria-live="polite"
            aria-busy={loadingView}
          >
            {!viewing && !loadingView ? (
              <div className="flex min-h-[12rem] items-center justify-center p-4 text-center text-xs text-ink-faint">
                {labels.quarantineSelectToRead}
              </div>
            ) : loadingView && !viewing ? (
              <div className="flex min-h-[12rem] items-center justify-center p-4">
                <Spinner className="h-4 w-4 text-ink-dim" />
              </div>
            ) : viewing ? (
              <div className="flex max-h-[60vh] flex-col">
                <div className="shrink-0 border-b border-white/8 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <code className="min-w-0 truncate text-xs text-cyan">{viewing.name}</code>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="soft"
                        className="!px-2.5 !py-1 !text-[11px]"
                        disabled={busyName === viewing.name || busyDeleteAll}
                        onClick={() => void promote(viewing.bucket, viewing.name)}
                      >
                        {busyName === viewing.name && busyKind === 'promote' ? (
                          <Spinner className="h-3 w-3" />
                        ) : null}
                        {labels.quarantinePromote}
                      </Button>
                      <Button
                        variant="danger"
                        className="!px-2.5 !py-1 !text-[11px]"
                        disabled={busyName === viewing.name || busyDeleteAll}
                        onClick={() => void removeNote(viewing.bucket, viewing.name)}
                      >
                        {busyName === viewing.name && busyKind === 'delete' ? (
                          <Spinner className="h-3 w-3" />
                        ) : null}
                        {labels.quarantineDelete}
                      </Button>
                    </div>
                  </div>
                  {(meta?.quality || meta?.msgCount) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                      {meta.quality ? (
                        <span>
                          {labels.quarantineMetaQuality}:{' '}
                          <span className="font-medium text-ink-dim">{meta.quality}</span>
                        </span>
                      ) : null}
                      {meta.msgCount ? (
                        <span>
                          {labels.quarantineMetaMsgCount}:{' '}
                          <span className="font-medium text-ink-dim">{meta.msgCount}</span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
                <pre className="overflow-auto whitespace-pre-wrap p-3 text-[11px] leading-relaxed text-ink-dim">
                  {viewing.content}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </GlassCard>
  )
}
