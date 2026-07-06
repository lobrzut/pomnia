import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
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
import { Button, Field, Input, Spinner } from '../components/ui'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { ClientIcon } from '../components/ClientIcon'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { BrainStatus, BrainTarget, ClientId, ClientStatus, Snippet } from '../lib/types'

const EMBEDDED_URL = 'http://127.0.0.1:7862'
const REMOTE_URL = 'http://brain.example.local:7862'

/**
 * First-run onboarding wizard. Full-screen overlay shown instead of VaultGate
 * until the user finishes (or skips through) setup. Five steps:
 *
 *   welcome → vault (required) → engine (skippable) → connect (skippable) → ready
 *
 * Every step keeps its outcome in `Outcomes` so the final screen can show an
 * honest summary — "skipped" is a first-class result, not a failure.
 */

type StepId = 'welcome' | 'vault' | 'engine' | 'connect' | 'ready'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'vault', label: 'Vault' },
  { id: 'engine', label: 'Engine' },
  { id: 'connect', label: 'Connect' },
  { id: 'ready', label: 'Ready' }
]

interface Outcomes {
  vault: 'done' | null
  engine: 'done' | 'skipped' | null
  brainTarget: BrainTarget | null
  connect: 'done' | 'skipped' | null
}

export default function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const [stepIdx, setStepIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [outcomes, setOutcomes] = useState<Outcomes>({ vault: null, engine: null, brainTarget: null, connect: null })

  const step = STEPS[stepIdx]

  function go(delta: number) {
    setDir(delta)
    setStepIdx((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)))
  }

  function resolve(key: keyof Outcomes, how: 'done' | 'skipped', extra?: Partial<Outcomes>) {
    setOutcomes((o) => ({ ...o, [key]: how, ...extra }))
    go(1)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-stretch bg-void/80 backdrop-blur-md"
    >
      {/* Step rail */}
      <div className="hidden w-[230px] shrink-0 flex-col justify-between border-r border-white/6 p-7 sm:flex">
        <div>
          <div className="mb-10 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl accent-grad ring-glow">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-grad">RELIQUA</div>
              <div className="text-[9px] font-medium uppercase tracking-[0.22em] text-ink-faint">first run</div>
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
                      state === 'active' && 'border-iris/60 bg-iris/15 text-ink shadow-[0_0_16px_-4px_#6366f1]',
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
          Local-first. Encrypted. Nothing leaves this machine unless you say so.
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
            {step.id === 'welcome' && <WelcomeStep onNext={() => go(1)} />}
            {step.id === 'vault' && <VaultStep onDone={() => resolve('vault', 'done')} onBack={() => go(-1)} />}
            {step.id === 'engine' && (
              <EngineStep
                onDone={(brainTarget) => resolve('engine', 'done', { brainTarget })}
                onSkip={() => resolve('engine', 'skipped', { brainTarget: 'embedded' })}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'connect' && (
              <ConnectStep
                brainTarget={outcomes.brainTarget ?? 'embedded'}
                onDone={() => resolve('connect', 'done')}
                onSkip={() => resolve('connect', 'skipped')}
                onBack={() => go(-1)}
              />
            )}
            {step.id === 'ready' && <ReadyStep outcomes={outcomes} onFinish={completeOnboarding} />}
          </ErrorBoundary>
        </motion.div>
      </div>
    </motion.div>
  )
}

/* ── Step 1: Welcome ────────────────────────────────────────────────────── */

const VALUE_PROPS = [
  { icon: Download, title: 'Capture', text: 'Every chat from Claude Code, Cursor, Antigravity & more — pulled into one place.' },
  { icon: Lock, title: 'Encrypt', text: 'AES-256-GCM vault on your disk. Your prompts are yours alone.' },
  { icon: Zap, title: 'Recall', text: 'Feed the context back to any AI through MCP — agents that remember you.' }
]

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="glass rounded-3xl p-9 text-center">
      <div className="relative mx-auto mb-6 h-20 w-20">
        <motion.div
          className="absolute inset-0 rounded-3xl accent-grad opacity-30 blur-xl"
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl accent-grad ring-glow">
          <Boxes className="h-10 w-10 text-white" />
        </div>
      </div>

      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-grad">
        Your AI conversations
        <br />
        deserve a memory
      </h1>
      <p className="mx-auto mt-2.5 max-w-[380px] text-sm leading-relaxed text-ink-dim">
        Reliqua turns scattered assistant chats into one encrypted, searchable memory — and hands it back to every AI
        you work with.
      </p>

      <div className="mt-7 grid grid-cols-3 gap-3">
        {VALUE_PROPS.map((v, i) => (
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

      <Button onClick={onNext} className="mt-8 w-full">
        <Sparkles className="h-4 w-4" /> Set up in 2 minutes
      </Button>
    </div>
  )
}

/* ── Step 2: Vault ──────────────────────────────────────────────────────── */

function VaultStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const { createVault, openVault } = useStore()
  const [mode, setMode] = useState<'create' | 'unlock'>('create')
  const [path, setPath] = useState('')
  const [name, setName] = useState('My Vault')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

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
    <StepCard
      icon={ShieldCheck}
      title="Create your vault"
      lead="One encrypted folder holds everything Reliqua captures. Pick where it lives and choose a passphrase you won't lose."
    >
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
              {m === 'create' ? 'New vault' : 'I have one'}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-3.5">
        <Field label={mode === 'create' ? 'New vault folder' : 'Vault folder'}>
          <div className="flex gap-2">
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="…/MyVault.reliqua" />
            <Button variant="soft" onClick={pick}>
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </Field>
        {mode === 'create' && (
          <Field label="Vault name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <div className={clsx('grid gap-3.5', mode === 'create' ? 'grid-cols-2' : 'grid-cols-1')}>
          <Field label="Passphrase">
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••••" />
          </Field>
          {mode === 'create' && (
            <Field label="Confirm">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••" />
            </Field>
          )}
        </div>
        {mismatch && <p className="text-xs text-rose">Passphrases don't match.</p>}
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
          AES-256-GCM · scrypt key derivation · the passphrase is never stored. Lose it and the vault is unrecoverable.
        </p>
      </div>

      <StepNav onBack={onBack}>
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          {mode === 'create' ? 'Create & continue' : 'Unlock & continue'}
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
  const setBrainTarget = useStore((s) => s.setBrainTarget)
  const setRemoteBrainUrl = useStore((s) => s.setRemoteBrainUrl)
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [mode, setMode] = useState<BrainTarget>('embedded')
  const [remoteUrl, setRemoteUrl] = useState(remoteBrainUrl)

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

  const found = !!status?.reachable
  const canContinue = mode === 'remote' || found

  function continueWithMode() {
    setBrainTarget(mode)
    if (mode === 'remote') setRemoteBrainUrl(remoteUrl.trim() || REMOTE_URL)
    onDone(mode)
  }

  return (
    <StepCard
      icon={Cpu}
      title="How will Brain run?"
      lead="Pick local embedded brain (built into Reliqua) or your homelab master. Ollama on this machine powers embeddings for the local path."
    >
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('embedded')}
          className={clsx(
            'no-drag rounded-2xl border px-4 py-3 text-left transition-colors',
            mode === 'embedded' ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30' : 'border-white/8 bg-black/20 hover:bg-white/5'
          )}
        >
          <div className="text-sm font-semibold text-ink">Local embedded</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            One .exe, MCP on {EMBEDDED_URL} — no remote server, no token.
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
          <div className="text-sm font-semibold text-ink">Remote master</div>
          <div className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Your Brain server on the LAN — three MCP servers + Bearer token.
          </div>
        </button>
      </div>

      {mode === 'remote' && (
        <div className="mb-4">
          <Field label="Master MCP URL">
            <Input value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} placeholder={REMOTE_URL} />
          </Field>
        </div>
      )}

      {mode === 'embedded' &&
        (checking ? (
          <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
            <Spinner className="h-4 w-4 text-iris" />
            <span className="text-sm text-ink-dim">Looking for Ollama on this machine…</span>
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
              <span className="text-sm font-semibold text-ink">Ollama is running</span>
              <span className="ml-auto font-mono text-[11px] text-ink-faint">{status!.baseUrl}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(status?.models ?? []).slice(0, 4).map((m) => (
                <span key={m} className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[11px] text-ink-dim">
                  {m}
                </span>
              ))}
              {(status?.models ?? []).length > 4 && (
                <span className="px-1.5 py-1 text-[11px] text-ink-faint">+{(status?.models ?? []).length - 4} more</span>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
              Embedding model: <code className="text-cyan">{status?.embedModel ?? 'nomic-embed-text'}</code> — powers local semantic search.
            </p>
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-amber/20 bg-amber/5 p-4">
            <div className="text-sm font-semibold text-ink">Ollama not found</div>
            <ol className="mt-2.5 space-y-2 text-[13px] text-ink-dim">
              <li className="flex gap-2">
                <span className="font-bold text-amber">1.</span>
                <span>
                  Download from <code className="text-cyan">ollama.com/download</code> and install (2 min).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber">2.</span>
                <span>
                  Pull the embedding model:{' '}
                  <code className="rounded bg-black/40 px-1.5 py-0.5 text-cyan">ollama pull nomic-embed-text</code>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-amber">3.</span>
                <span>Come back and re-check.</span>
              </li>
            </ol>
            <Button variant="soft" onClick={check} className="mt-3.5">
              <RefreshCw className="h-3.5 w-3.5" /> Re-check
            </Button>
          </div>
        ))}

      {mode === 'remote' && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          Ollama on this PC is optional in remote mode — distillation runs on your master server.
        </p>
      )}

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel="Skip — pick later in Connect tab">
        <Button onClick={continueWithMode} disabled={!canContinue}>
          <ArrowRight className="h-4 w-4" /> Continue
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 4: Connect a client ───────────────────────────────────────────── */

function ConnectStep({
  brainTarget,
  onDone,
  onSkip,
  onBack
}: {
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

  return (
    <StepCard
      icon={Plug}
      title="Give an AI your memory"
      lead={`Snippets target ${brainTarget === 'embedded' ? 'local embedded brain' : 'your remote master'} (${brainUrl}). Pick a client — paste the config, we never touch their files.`}
    >
      {clients === null ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/20 px-4 py-5">
          <Spinner className="h-4 w-4 text-iris" />
          <span className="text-sm text-ink-dim">Detecting MCP clients…</span>
        </div>
      ) : detected.length === 0 ? (
        <p className="rounded-2xl border border-white/8 bg-black/20 px-4 py-5 text-sm text-ink-dim">
          No MCP clients detected. Install Claude Code, Cursor or another MCP tool — then wire it up any time from the
          Connect tab.
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
                  {copied ? 'Copied' : 'Copy config'}
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                Paste as the file's content (or merge if it exists), then: {snippet.restartHint}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <StepNav onBack={onBack} onSkip={onSkip} skipLabel="Skip — wire clients later from the Connect tab">
        <Button onClick={onDone} disabled={!picked || !snippet}>
          <ArrowRight className="h-4 w-4" /> Continue
        </Button>
      </StepNav>
    </StepCard>
  )
}

/* ── Step 5: Ready ──────────────────────────────────────────────────────── */

function ReadyStep({ outcomes, onFinish }: { outcomes: Outcomes; onFinish: () => void }) {
  const rows = [
    { label: 'Encrypted vault', state: outcomes.vault ?? 'skipped' },
    {
      label: outcomes.brainTarget === 'remote' ? 'Remote Brain master' : 'Local embedded brain',
      state: outcomes.engine ?? 'skipped'
    },
    { label: 'First MCP client', state: outcomes.connect ?? 'skipped' }
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

      <h1 className="text-[26px] font-bold tracking-tight text-grad">You're set</h1>
      <p className="mx-auto mt-2 max-w-[360px] text-sm text-ink-dim">
        Run your first backup from the Dashboard — everything else is wired.
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
              {r.state === 'done' ? 'ready' : 'later'}
            </span>
          </motion.div>
        ))}
      </div>

      <Button onClick={onFinish} className="mt-8 w-full">
        <Sparkles className="h-4 w-4" /> Enter Reliqua
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
  return (
    <div className="mt-6 flex items-center gap-3">
      <button
        onClick={onBack}
        className="no-drag flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      {onSkip && (
        <button
          onClick={onSkip}
          className="no-drag truncate rounded-lg px-2 py-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink-dim"
          title={skipLabel}
        >
          {skipLabel ?? 'Skip for now'}
        </button>
      )}
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  )
}
