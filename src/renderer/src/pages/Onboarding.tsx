// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Cpu,
  Download,
  FolderOpen,
  KeyRound,
  Lock,
  PartyPopper,
  Plug,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap
} from 'lucide-react'
import clsx from 'clsx'
import { AppLogo } from '../components/AppLogo'
import { Button, Field, Input, ProgressBar, Spinner } from '../components/ui'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { GuideOverlay } from '../components/GuideMap'
import { ClientIcon } from '../components/ClientIcon'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'
import { identifyEngine } from '@core/brain/engine'
import { hasOllamaModel } from '@core/brain/modelMatch'
import { EMBEDDED_BRAIN_DEFAULT_URL, REMOTE_BRAIN_URL_PLACEHOLDER } from '@core/brain/snippet'
import type {
  BrainStatus,
  BrainTarget,
  ClientId,
  ClientStatus,
  EmbeddedBrainStatus,
  OllamaPullEvent,
  Snippet,
} from '../lib/types'

const EMBEDDED_URL = EMBEDDED_BRAIN_DEFAULT_URL
const REMOTE_URL_PLACEHOLDER = REMOTE_BRAIN_URL_PLACEHOLDER

/**
 * First-run onboarding wizard. Full-screen overlay shown instead of VaultGate
 * until the user finishes (or skips through) setup. Five steps:
 *
 *   welcome → vault (required) → engine (skippable) → connect (skippable) → ready
 *
 * Every step keeps its outcome in `Outcomes` so the final screen can show an
 * honest summary — "skipped" is a first-class result, not a failure.
 */

type StepId = 'welcome' | 'vault' | 'backup' | 'engine' | 'connect' | 'ready'

interface Outcomes {
  vault: 'done' | null
  backup: 'done' | 'skipped' | null
  engine: 'done' | 'skipped' | null
  brainTarget: BrainTarget | null
  connect: 'done' | 'skipped' | null
}

export default function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const simpleMode = useStore((s) => s.simpleMode)
  const labels = uiLabels()
  const STEPS: { id: StepId; label: string }[] = simpleMode
    ? [
        { id: 'welcome', label: labels.onboardingStepStart },
        { id: 'vault', label: labels.onboardingStepVault },
        { id: 'backup', label: labels.onboardingStepBackup },
        { id: 'engine', label: labels.onboardingStepMemory },
        { id: 'connect', label: labels.onboardingStepConnect },
        { id: 'ready', label: labels.onboardingStepReady },
      ]
    : [
        { id: 'welcome', label: labels.onboardingStepWelcome },
        { id: 'vault', label: labels.onboardingStepVault },
        { id: 'engine', label: labels.onboardingStepEngine },
        { id: 'connect', label: labels.onboardingStepConnect },
        { id: 'ready', label: labels.onboardingStepReady },
      ]
  const [stepIdx, setStepIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [outcomes, setOutcomes] = useState<Outcomes>({
    vault: null,
    backup: null,
    engine: null,
    brainTarget: null,
    connect: null
  })

  const step = STEPS[stepIdx]

  function go(delta: number) {
    setDir(delta)
    setStepIdx((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)))
  }

  function resolve(key: keyof Outcomes, how: 'done' | 'skipped', extra?: Partial<Outcomes>) {
    setOutcomes((o) => ({ ...o, [key]: how, ...extra }))
    go(1)
  }

  const isSimpleEngine = simpleMode && step.id === 'engine'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-stretch bg-void/80 backdrop-blur-md"
    >
      {/* Step rail — pt clears TitleBar (h-12) so brand isn't under window chrome */}
      <div className="hidden w-[230px] shrink-0 flex-col justify-between border-r border-white/6 px-7 pb-7 pt-14 sm:flex">
        <div>
          <div className="mb-10 flex items-center gap-2.5">
            <AppLogo size="sm" />
            <div className="min-w-0 leading-none">
              <div className="text-sm font-bold tracking-tight text-grad text-grad-sheen">POMNIA</div>
              <div className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.22em] text-ink-faint">
                {labels.onboardingFirstRun}
              </div>
            </div>
          </div>

          <ol className="relative">
            {/* connector line + animated fill */}
            <div className="absolute bottom-4 left-[13px] top-4 w-px bg-white/10" />
            <motion.div
              className="absolute left-[13px] top-4 w-px accent-grad"
              animate={{ height: `${(stepIdx / (STEPS.length - 1)) * 100 * 0.86}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 24 }}
            />
            {STEPS.map((s, i) => {
              const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'todo'
              return (
                <li key={s.id} className="relative flex items-center gap-3 py-2.5">
                  <motion.span
                    animate={{ scale: state === 'active' ? 1.12 : 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                    className={clsx(
                      'z-10 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition-colors duration-300',
                      state === 'done' && 'border-transparent accent-grad text-white',
                      state === 'active' && 'border-mint/60 bg-mint/15 text-ink shadow-[0_0_16px_-4px_#34d399]',
                      state === 'todo' && 'border-white/12 bg-black/40 text-ink-faint'
                    )}
                  >
                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </motion.span>
                  <span
                    className={clsx(
                      'text-[13px] font-medium transition-colors duration-300',
                      state === 'active' ? 'text-ink' : state === 'done' ? 'text-ink-dim' : 'text-ink-faint'
                    )}
                  >
                    {s.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>

        <p className="text-[10px] leading-relaxed text-ink-faint">
          {labels.onboardingSidebarFooter}
        </p>
      </div>

      {/* Step content — no mode="wait": exit-then-enter left Engine step blank in packaged Electron */}
      <div className="flex min-w-0 flex-1 items-center justify-center p-6">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[540px]"
        >
          <ErrorBoundary>
            {step.id === 'welcome' && <WelcomeStep simpleMode={simpleMode} onNext={() => go(1)} />}
            {step.id === 'vault' && <VaultStep onDone={() => resolve('vault', 'done')} onBack={() => go(-1)} />}
            {step.id === 'backup' && (
              <BackupStep
                onDone={() => resolve('backup', 'done')}
                onSkip={() => resolve('backup', 'skipped')}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'engine' && isSimpleEngine && (
              <SimpleBrainStep
                onDone={() => resolve('engine', 'done', { brainTarget: 'embedded' })}
                onSkip={() => resolve('engine', 'skipped', { brainTarget: 'embedded' })}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'engine' && !isSimpleEngine && (
              <EngineStep
                onDone={(brainTarget) => resolve('engine', 'done', { brainTarget })}
                onSkip={() => resolve('engine', 'skipped', { brainTarget: 'embedded' })}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'connect' && (
              <ConnectStep
                simpleMode={simpleMode}
                brainTarget={outcomes.brainTarget ?? 'embedded'}
                onDone={() => resolve('connect', 'done')}
                onSkip={() => resolve('connect', 'skipped')}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'ready' && <ReadyStep simpleMode={simpleMode} outcomes={outcomes} onFinish={completeOnboarding} />}
          </ErrorBoundary>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ── Step 1: Welcome ────────────────────────────────────────────────────── */

function WelcomeStep({ simpleMode, onNext }: { simpleMode: boolean; onNext: () => void }) {
  const labels = uiLabels()
  const [guideOpen, setGuideOpen] = useState(false)
  const valueProps = [
    { icon: Download, title: labels.onboardingValueCollectTitle, text: labels.onboardingValueCollectText },
    { icon: Lock, title: labels.onboardingValueEncryptTitle, text: labels.onboardingValueEncryptText },
    { icon: Zap, title: labels.onboardingValueRecallTitle, text: labels.onboardingValueRecallText },
  ]

  return (
    <>
      <AnimatePresence>{guideOpen && <GuideOverlay onClose={() => setGuideOpen(false)} />}</AnimatePresence>
      <div className="glass rounded-3xl p-9 text-center">
      <div className="relative mx-auto mb-6 h-20 w-20">
        <motion.div
          className="absolute inset-0 rounded-full bg-amber/25 opacity-50 blur-xl"
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <AppLogo size="xl" glow className="relative" />
      </div>

      <h1 className="whitespace-pre-line text-[28px] font-bold leading-tight tracking-tight text-grad">
        {labels.onboardingWelcomeTitle}
      </h1>
      <p className="mx-auto mt-2.5 max-w-[380px] text-sm leading-relaxed text-ink-dim">
        {simpleMode ? labels.onboardingWelcomeLeadSimple : labels.onboardingWelcomeLeadFull}
      </p>

      {!simpleMode && (
        <div className="mt-7 grid grid-cols-3 gap-3">
          {valueProps.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-white/8 bg-black/20 p-4 text-left"
            >
              <v.icon className="mb-2 h-[18px] w-[18px] text-iris" />
              <div className="text-[13px] font-semibold text-ink">{v.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">{v.text}</div>
            </motion.div>
          ))}
        </div>
      )}

      <Button onClick={onNext} className="mt-8 w-full">
        <Sparkles className="h-4 w-4" /> {simpleMode ? labels.onboardingWelcomeCtaSimple : labels.onboardingWelcomeCtaFull}
      </Button>
      <button
        type="button"
        onClick={() => setGuideOpen(true)}
        className="no-drag mt-4 text-xs font-medium text-iris hover:text-cyan"
      >
        {labels.helpDontKnowStart}
      </button>
    </div>
    </>
  )
}

/* ── Step 2: Vault ──────────────────────────────────────────────────────── */

function VaultStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const labels = uiLabels()
  const { createVault, openVault } = useStore()
  const [mode, setMode] = useState<'create' | 'unlock'>('create')
  const [path, setPath] = useState('')
  const [name, setName] = useState('My Vault')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [pathPlaceholder, setPathPlaceholder] = useState(labels.vaultPathPlaceholder)

  useEffect(() => {
    void api
      .appDataLocations()
      .then((loc) => {
        if (loc.defaultVaultExample) setPathPlaceholder(loc.defaultVaultExample)
      })
      .catch(() => {})
  }, [])

  const mismatch = mode === 'create' && !!pass && !!confirm && pass !== confirm
  const valid = !!path && !!pass && !mismatch && (mode === 'unlock' || !!confirm)

  async function pick() {
    const dir = await api.pickDirectory()
    if (dir) setPath(dir)
  }

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    const ok = mode === 'create' ? await createVault(path, name, pass) : await openVault(path, pass)
    setBusy(false)
    if (ok) onDone()
  }

  return (
    <StepCard icon={ShieldCheck} title={labels.onboardingVaultTitle} lead={labels.onboardingVaultLead}>
      <div className="mb-4 flex rounded-xl border border-white/10 bg-black/20 p-1">
        {(['create', 'unlock'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={clsx(
              'relative flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
              mode === m ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
            )}
          >
            {mode === m && <motion.div layoutId="ob-vault-tab" className="absolute inset-0 rounded-lg accent-grad opacity-90" />}
            <span className="relative flex items-center justify-center gap-1.5">
              {m === 'create' ? <Sparkles className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
              {m === 'create' ? labels.onboardingVaultCreateTab : labels.onboardingVaultOpenTab}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3.5">
        <Field label={mode === 'create' ? labels.onboardingVaultNewFolder : labels.onboardingVaultFolder}>
          <div className="flex gap-2">
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder={pathPlaceholder} />
            <Button variant="soft" onClick={pick}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        {mode === 'create' && (
          <Field label={labels.vault}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <div className={clsx('grid gap-3.5', mode === 'create' ? 'grid-cols-2' : 'grid-cols-1')}>
          <Field label={labels.onboardingPassphrase}>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••••" />
          </Field>
          {mode === 'create' && (
            <Field label={labels.onboardingConfirmPass}>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••" />
            </Field>
          )}
        </div>
        {mismatch && <p className="text-xs text-rose">{labels.onboardingPassMismatch}</p>}
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          {labels.onboardingVaultCryptoHint}
        </p>
      </div>

      <StepNav onBack={onBack}>
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {mode === 'create' ? labels.onboardingVaultCreateContinue : labels.onboardingVaultUnlockContinue}
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 2b: Backup (simple mode) ─────────────────────────────────────── */

function BackupStep({
  onDone,
  onSkip,
  onBack
}: {
  onDone: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const labels = uiLabels()
  const { scan, sources, selected, backup, backingUp, backupPhase } = useStore()
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    void scan().finally(() => setScanned(true))
  }, [scan])

  const picked = sources.filter((s) => selected.has(s.id) && s.installed)

  async function runBackup() {
    if (backingUp || picked.length === 0) return
    await backup('First backup — onboarding')
    onDone()
  }

  return (
    <StepCard icon={Download} title={labels.onboardingBackupTitle} lead={labels.onboardingBackupLead}>
      {!scanned ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
          <Spinner className="h-4 w-4 text-iris" />
          <span className="text-sm text-ink-dim">{labels.onboardingBackupScanning}</span>
        </div>
      ) : picked.length === 0 ? (
        <p className="rounded-2xl border border-white/8 bg-black/20 px-4 py-5 text-sm text-ink-dim">
          {labels.onboardingBackupNone}
        </p>
      ) : (
        <div className="space-y-2">
          {picked.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2.5 rounded-xl border border-mint/20 bg-mint/5 px-3.5 py-2.5"
            >
              <Check className="h-4 w-4 shrink-0 text-mint" />
              <span className="text-[13px] font-medium text-ink">{s.label}</span>
              {s.conversations != null && (
                <span className="ml-auto text-[11px] text-ink-faint">{labels.onboardingBackupChats(s.conversations)}</span>
              )}
            </div>
          ))}
          {backingUp && (
            <p className="text-xs text-ink-dim">{backupPhase || labels.onboardingBackupBackingUp}</p>
          )}
        </div>
      )}

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel={labels.onboardingBackupSkip}>
        <Button onClick={() => void runBackup()} disabled={!scanned || backingUp || picked.length === 0}>
          {backingUp ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          {labels.onboardingBackupNow}
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 3: Engine (Ollama) ────────────────────────────────────────────── */

function EngineStep({
  onDone,
  onSkip,
  onBack
}: {
  onDone: (target: BrainTarget) => void
  onSkip: () => void
  onBack: () => void
}) {
  const labels = uiLabels()
  const setBrainTarget = useStore((s) => s.setBrainTarget)
  const setRemoteBrainUrl = useStore((s) => s.setRemoteBrainUrl)
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [mode, setMode] = useState<BrainTarget>('embedded')
  const [remoteUrl, setRemoteUrl] = useState(remoteBrainUrl)
  const [remoteTesting, setRemoteTesting] = useState(false)
  const [remoteOk, setRemoteOk] = useState<boolean | null>(null)
  const [remoteDetail, setRemoteDetail] = useState('')
  const [pull, setPull] = useState<OllamaPullEvent | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)

  /**
   * "Reachable" is not the question. A saved URL from an older machine pointed
   * at the legacy Python brain, which answers every probe — the test would have
   * gone green while the agents got a different brain over a different vault.
   * So the pass condition is the engine naming itself, not the socket opening.
   */
  async function testRemote() {
    const url = remoteUrl.trim()
    if (!url) return
    setRemoteTesting(true)
    setRemoteOk(null)
    try {
      const r = await api.connectStatus(url, undefined, 'remote')
      if (!r.brain.reachable) {
        setRemoteOk(false)
        setRemoteDetail(r.brain.error || labels.onboardingEngineRemoteFail)
        return
      }
      const engine = identifyEngine(r.brain.data as Record<string, unknown> | undefined)
      setRemoteOk(engine.compatible)
      setRemoteDetail(
        engine.compatible
          ? labels.onboardingEngineRemoteOk
          : labels.onboardingEngineRemoteWrongEngine(engine.label),
      )
    } catch (e) {
      setRemoteOk(false)
      setRemoteDetail((e as Error).message)
    } finally {
      setRemoteTesting(false)
    }
  }

  async function check() {
    setChecking(true)
    try {
      setStatus(await api.brainStatus())
    } catch {
      setStatus(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void check()
  }, [])

  useEffect(() => api.onOllamaPullProgress(setPull), [])

  /**
   * Same IPC as Brain advanced profiles. First-run used to only print
   * `ollama pull …` — Linux premiere users hit that wall hardest because they
   * never discovered the advanced Brain card. Verify tags after pull; success
   * alone is how empty indexes used to look green.
   */
  async function pullModel(model: string) {
    if (pull) return
    setPullError(null)
    setPull({ model, status: 'starting' })
    try {
      await api.ollamaPull(model)
      const after = await api.brainStatus()
      setStatus(after)
      if (!hasOllamaModel(after.models ?? [], model)) {
        setPullError(labels.toastModelStillMissing(model))
        return
      }
    } catch (e) {
      setPullError((e as Error).message || labels.toastPullFailed)
    } finally {
      setPull(null)
    }
  }

  const found = !!status?.reachable
  const models = status?.models ?? []
  const embedModel = status?.embedModel ?? 'nomic-embed-text'
  const distillModel = status?.chatModel ?? 'qwen2.5:14b'
  const hasEmbed = hasOllamaModel(models, embedModel)
  const hasDistill = hasOllamaModel(models, distillModel)
  const remoteUrlTrimmed = remoteUrl.trim()
  // The embed model is not a nice-to-have: without it the local brain indexes
  // nothing and every agent search comes back empty, while the app still looks
  // healthy. Finishing setup in that state is the failure we keep paying for.
  // The distill model stays optional — search works without it.
  //
  // Remote gets the same bar for the same reason: a URL that was typed but
  // never verified is setup that reports done while nothing is wired. The step
  // is skippable, so a user whose server is down still has a way past.
  const canContinue = mode === 'embedded' ? found && hasEmbed : remoteOk === true

  function continueWithMode() {
    setBrainTarget(mode)
    if (mode === 'remote' && remoteUrlTrimmed) setRemoteBrainUrl(remoteUrlTrimmed)
    onDone(mode)
  }

  function pullRow(model: string, missingCopy: string) {
    const active = pull?.model === model
    const pct =
      active && pull.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : null
    return (
      <div key={model} className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1">{missingCopy}</p>
          {active ? (
            <button
              type="button"
              className="no-drag shrink-0 text-[11px] font-semibold text-rose hover:underline"
              onClick={() => void api.ollamaPullCancel()}
            >
              {labels.onboardingEngineCancelPull}
            </button>
          ) : (
            <Button
              variant="soft"
              className="!px-2.5 !py-1 !text-[11px]"
              disabled={pull !== null}
              onClick={() => void pullModel(model)}
            >
              <Download className="h-3 w-3" /> {labels.onboardingEnginePullBtn}
            </Button>
          )}
        </div>
        {active && (
          <div className="space-y-1">
            <ProgressBar value={pct ?? 8} />
            <span className="text-[10px] text-ink-faint">
              {pct !== null && pull.total
                ? `${pct}% · ${((pull.completed ?? 0) / 1e9).toFixed(2)} / ${(pull.total / 1e9).toFixed(2)} GB`
                : pull.status}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <StepCard icon={Cpu} title={labels.onboardingEngineTitle} lead={labels.onboardingEngineLead}>
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('embedded')}
          className={clsx(
            'no-drag rounded-2xl border px-4 py-3 text-left transition-colors',
            mode === 'embedded' ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30' : 'border-white/8 bg-black/20 hover:bg-white/5'
          )}
        >
          <div className="text-sm font-semibold text-ink">{labels.onboardingEngineLocal}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            {labels.onboardingEngineLocalHint(EMBEDDED_URL)}
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode('remote')}
          className={clsx(
            'no-drag rounded-2xl border px-4 py-3 text-left transition-colors',
            mode === 'remote' ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30' : 'border-white/8 bg-black/20 hover:bg-white/5'
          )}
        >
          <div className="text-sm font-semibold text-ink">{labels.onboardingEngineRemote}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            {labels.onboardingEngineRemoteHint}
          </div>
        </button>
      </div>

      {mode === 'remote' && (
        <div className="mb-4 space-y-2">
          <Field label={labels.onboardingEngineMasterUrl}>
            <Input
              value={remoteUrl}
              onChange={(e) => {
                setRemoteUrl(e.target.value)
                setRemoteOk(null)
              }}
              placeholder={REMOTE_URL_PLACEHOLDER}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" onClick={() => void testRemote()} disabled={!remoteUrlTrimmed || remoteTesting}>
              {remoteTesting ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {labels.onboardingEngineTestConn}
            </Button>
            {remoteOk === true && (
              <span className="text-[11px] font-medium text-mint">{remoteDetail}</span>
            )}
            {remoteOk === false && (
              <span className="text-[11px] text-amber">{remoteDetail}</span>
            )}
            {remoteOk === null && !remoteTesting && remoteUrlTrimmed.length > 0 && (
              <span className="text-[11px] text-ink-faint">{labels.onboardingEngineRemoteUntested}</span>
            )}
          </div>
        </div>
      )}

      {mode === 'embedded' &&
        (checking ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
            <Spinner className="h-4 w-4 text-iris" />
            <span className="text-sm text-ink-dim">{labels.onboardingEngineLooking}</span>
          </div>
        ) : found ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-mint/20 bg-mint/5 p-4"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
              </span>
              <span className="text-sm font-semibold text-ink">{labels.onboardingEngineRunning}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-faint">{status!.baseUrl}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {models.slice(0, 4).map((m) => (
                <span key={m} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[11px] text-ink-dim">
                  {m}
                </span>
              ))}
              {models.length > 4 && (
                <span className="px-1.5 py-1 text-[11px] text-ink-faint">{labels.onboardingEngineMoreModels(models.length - 4)}</span>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              {labels.onboardingEngineEmbedHint(embedModel)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
              {labels.onboardingEngineDistillHint(distillModel)}
            </p>
            {(!hasEmbed || !hasDistill) && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-amber/25 bg-amber/10 px-3 py-2.5 text-[11px] text-amber-100">
                <div className="font-semibold text-ink">{labels.onboardingEngineModelsNeeded}</div>
                {!hasEmbed &&
                  pullRow(embedModel, labels.onboardingEngineEmbedMissing(`ollama pull ${embedModel}`))}
                {!hasDistill &&
                  pullRow(
                    distillModel,
                    labels.onboardingEngineDistillMissing(`ollama pull ${distillModel}`, '~9 GB'),
                  )}
                {pullError && <p className="text-rose">{pullError}</p>}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-amber/20 bg-amber/5 p-4">
            <div className="text-sm font-semibold text-ink">{labels.onboardingEngineNotFound}</div>
            <ol className="mt-2.5 space-y-2 text-[13px] text-ink-dim">
              <li className="flex gap-2">
                <span className="font-bold text-amber">1.</span>
                <span>{labels.onboardingEngineInstall1}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber">2.</span>
                <span>{labels.onboardingEngineInstall2}</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber">3.</span>
                <span>{labels.onboardingEngineInstall3}</span>
              </li>
            </ol>
            <Button variant="soft" onClick={check} className="mt-3.5">
              <RefreshCw className="h-3.5 w-3.5" /> {labels.onboardingEngineRecheck}
            </Button>
          </div>
        ))}

      {mode === 'remote' && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          {labels.onboardingEngineRemoteOllamaOptional}
        </p>
      )}

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel={labels.onboardingEngineSkip}>
        <Button onClick={continueWithMode} disabled={!canContinue}>
          <ArrowRight className="h-4 w-4" /> {labels.onboardingContinue}
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 3b: Simple brain (embedded only) ──────────────────────────────── */

function SimpleBrainStep({
  onDone,
  onSkip,
  onBack
}: {
  onDone: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const labels = uiLabels()
  const setBrainTarget = useStore((s) => s.setBrainTarget)
  const [embedded, setEmbedded] = useState<EmbeddedBrainStatus | null>(null)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      setEmbedded(await api.brainCoreStatus())
    } catch {
      setEmbedded(null)
    }
  }

  useEffect(() => {
    setBrainTarget('embedded')
    void refresh()
  }, [setBrainTarget])

  async function startAndContinue() {
    if (busy) return
    setBusy(true)
    try {
      if (!embedded?.running) {
        setEmbedded(await api.brainCoreStart())
      }
      onDone()
    } catch {
      void refresh()
    } finally {
      setBusy(false)
    }
  }

  const running = embedded?.running

  return (
    <StepCard icon={Cpu} title={labels.onboardingSimpleBrainTitle} lead={labels.onboardingSimpleBrainLead}>
      {embedded === null ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
          <Spinner className="h-4 w-4 text-iris" />
          <span className="text-sm text-ink-dim">{labels.onboardingSimpleBrainChecking}</span>
        </div>
      ) : running ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-mint/20 bg-mint/5 p-4"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mint" />
            </span>
            <span className="text-sm font-semibold text-ink">{labels.onboardingSimpleBrainRunning}</span>
            <code className="ml-auto font-mono text-[11px] text-ink-faint">{embedded.url}</code>
          </div>
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
          <div className="text-sm font-semibold text-ink">{labels.onboardingSimpleBrainReady}</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
            {labels.onboardingSimpleBrainReadyDetail(EMBEDDED_URL)}
          </p>
        </div>
      )}

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel={labels.onboardingSimpleBrainSkip}>
        <Button onClick={() => void (running ? onDone() : startAndContinue())} disabled={busy || embedded === null}>
          {busy ? <Spinner className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          {running ? labels.onboardingContinue : labels.onboardingSimpleBrainStart}
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 4: Connect a client ───────────────────────────────────────────── */

function ConnectStep({
  simpleMode,
  brainTarget,
  onDone,
  onSkip,
  onBack
}: {
  simpleMode: boolean
  brainTarget: BrainTarget
  onDone: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const brainUrl = brainTarget === 'embedded' ? EMBEDDED_URL : remoteBrainUrl
  const [clients, setClients] = useState<ClientStatus[] | null>(null)
  const [picked, setPicked] = useState<ClientId | null>(null)
  const [snippet, setSnippet] = useState<Snippet | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api
      .connectStatus(brainUrl, undefined, brainTarget)
      .then((r) => setClients(r.clients))
      .catch(() => setClients([]))
  }, [brainUrl, brainTarget])

  const detected = useMemo(() => (clients ?? []).filter((c) => c.configExists), [clients])

  useEffect(() => {
    if (!simpleMode || picked || !clients) return
    const cursor = detected.find((c) => c.id === 'cursor')
    if (cursor) void pick('cursor')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, simpleMode])

  async function pick(id: ClientId) {
    setPicked(id)
    setSnippet(null)
    setCopied(false)
    try {
      setSnippet(await api.connectSnippet(id, brainUrl, undefined, brainTarget))
    } catch {
      setSnippet(null)
    }
  }

  async function copy() {
    if (!snippet) return
    await navigator.clipboard.writeText(snippet.fullFileJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const labels = uiLabels()
  const title = labels.onboardingConnectTitle
  const lead = labels.onboardingConnectLead

  return (
    <StepCard icon={Plug} title={title} lead={lead}>
      {clients === null ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
          <Spinner className="h-4 w-4 text-iris" />
          <span className="text-sm text-ink-dim">{labels.statusChecking}</span>
        </div>
      ) : detected.length === 0 ? (
        <p className="rounded-2xl border border-white/8 bg-black/20 px-4 py-5 text-sm text-ink-dim">
          {labels.onboardingConnectSkip}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {detected.slice(0, 6).map((c) => (
            <button
              key={c.id}
              onClick={() => void pick(c.id)}
              className={clsx(
                'no-drag flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                picked === c.id ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30' : 'border-white/8 bg-black/20 hover:bg-white/5'
              )}
            >
              <ClientIcon id={c.id} size={30} />
              <span className="truncate text-[13px] font-medium text-ink">{c.label}</span>
              {c.state === 'wired' && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-mint" />}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {picked && snippet && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 rounded-2xl border border-white/8 bg-black/30 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate font-mono text-[11px] text-ink-dim">{snippet.filePath}</code>
                <Button variant="soft" onClick={copy} className="shrink-0 !px-3 !py-1.5 !text-[12px]">
                  {copied ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? labels.onboardingConnectCopied : labels.onboardingConnectCopy}
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                {snippet.restartHint}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel={labels.onboardingConnectSkip}>
        <Button onClick={onDone} disabled={!picked || !snippet}>
          <ArrowRight className="h-4 w-4" /> {labels.onboardingContinue}
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 5: Ready ──────────────────────────────────────────────────────── */

function ReadyStep({
  simpleMode,
  outcomes,
  onFinish
}: {
  simpleMode: boolean
  outcomes: Outcomes
  onFinish: () => void
}) {
  const labels = uiLabels()
  const rows = simpleMode
    ? [
        { label: labels.onboardingReadyVault, state: outcomes.vault ?? 'skipped' },
        { label: labels.onboardingReadyBackup, state: outcomes.backup ?? 'skipped' },
        { label: labels.onboardingReadySearch, state: outcomes.engine ?? 'skipped' },
        { label: labels.onboardingReadyMcp, state: outcomes.connect ?? 'skipped' }
      ]
    : [
        { label: labels.onboardingReadyVault, state: outcomes.vault ?? 'skipped' },
        {
          label: outcomes.brainTarget === 'remote' ? labels.onboardingReadyRemote : labels.onboardingReadySearch,
          state: outcomes.engine ?? 'skipped'
        },
        { label: labels.onboardingReadyMcpFirst, state: outcomes.connect ?? 'skipped' }
      ]
  return (
    <div className="glass rounded-3xl p-9 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
        className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint/15 ring-1 ring-mint/40"
      >
        <PartyPopper className="h-7 w-7 text-mint" />
      </motion.div>

      <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.onboardingReadyTitle}</h1>
      <p className="mx-auto mt-2 max-w-[360px] text-sm text-ink-dim">
        {simpleMode ? labels.onboardingReadyLeadDone : labels.onboardingReadyLeadPartial}
      </p>

      <div className="mx-auto mt-6 max-w-[340px] space-y-2 text-left">
        {rows.map((r, i) => (
          <motion.div
            key={r.label}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.12 }}
            className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-black/20 px-3.5 py-2.5"
          >
            {r.state === 'done' ? (
              <Check className="h-4 w-4 shrink-0 text-mint" />
            ) : (
              <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
            )}
            <span className="text-[13px] text-ink">{r.label}</span>
            <span className={clsx('ml-auto text-[11px]', r.state === 'done' ? 'text-mint' : 'text-ink-faint')}>
              {r.state === 'done' ? labels.healthOk : labels.onboardingSkipForNow}
            </span>
          </motion.div>
        ))}
      </div>

      <Button onClick={onFinish} className="mt-8 w-full">
        <Sparkles className="h-4 w-4" /> {labels.onboardingEnterApp}
      </Button>
    </div>
  )
}

/* ── Shared step chrome ─────────────────────────────────────────────────── */

function StepCard({
  icon: Icon,
  title,
  lead,
  children
}: {
  icon: typeof Cpu
  title: string
  lead: string
  children: React.ReactNode
}) {
  return (
    <div className="glass rounded-3xl p-8">
      <div className="mb-5 flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl accent-grad ring-glow">
          <Icon className="h-[22px] w-[22px] text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{lead}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function StepNav({
  onBack,
  onSkip,
  skipLabel,
  children
}: {
  onBack: () => void
  onSkip?: () => void
  skipLabel?: string
  children: React.ReactNode
}) {
  const labels = uiLabels()
  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        onClick={onBack}
        className="no-drag flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {labels.onboardingBack}
      </button>
      {onSkip && (
        <button
          onClick={onSkip}
          className="no-drag truncate rounded-lg px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink-dim"
          title={skipLabel}
        >
          {skipLabel ?? labels.onboardingSkipForNow}
        </button>
      )}
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  )
}
