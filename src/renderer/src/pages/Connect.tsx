// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  FilePlus2,
  GitMerge,
  Info,
  KeyRound,
  ListChecks,
  Plug,
  RefreshCw,
  Settings2,
  Sparkles,
  UploadCloud,
  X
} from 'lucide-react'
import { Badge, Button, Field, GlassCard, Input, Spinner, Toggle } from '../components/ui'
import { ClientIcon, CLIENT_BRAND } from '../components/ClientIcon'
import {
  EMBEDDED_BRAIN_DEFAULT_URL,
  REMOTE_BRAIN_URL_PLACEHOLDER,
} from '@core/brain/snippet'
import { identifyEngine } from '@core/brain/engine'
import { brainBaseUrl, canEditBrainUrl, resolveBrainTarget } from '@core/brain/brainTarget'
import { isMini } from '../lib/flavour'
import { formatClientVersion } from '../lib/clientVersion'
import { buildAgentSetupPrompt, buildGenericSnippet } from '@core/brain/genericSnippet'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { getUiLocale } from '../lib/uiLocale'
import { useStore, dashboardUrlFromBrainUrl, ollamaUrlFromBrainUrl } from '../store/useStore'
import type { BrainTarget, ClientId, ClientStatus, Snippet, WiredState } from '../lib/types'

const EMBEDDED_URL = EMBEDDED_BRAIN_DEFAULT_URL
const REMOTE_URL_PLACEHOLDER = REMOTE_BRAIN_URL_PLACEHOLDER

const CLIENT_ORDER: ClientId[] = [
  'claude-code',
  'cursor',
  'antigravity',
  'claude-desktop',
  'vscode',
  'windsurf',
  'hermes'
]

function stateMeta(
  state: WiredState,
  labels: ReturnType<typeof uiLabels>,
): { label: string; color: string; Icon: typeof CheckCircle2 } {
  switch (state) {
    case 'wired':
      return { label: labels.clientWired, color: '#34d399', Icon: CheckCircle2 }
    case 'unreachable':
      // Config is right, host is not answering — the machine-move case. Must not
      // read as "Połączony", which is exactly how it used to look.
      return { label: labels.clientUnreachable, color: '#fb7185', Icon: AlertTriangle }
    case 'partial':
      return { label: labels.clientPartial, color: '#fbbf24', Icon: AlertTriangle }
    case 'config_error':
      return { label: labels.clientConfigError, color: '#fb7185', Icon: AlertTriangle }
    default:
      return { label: labels.clientNone, color: '#5b6178', Icon: Circle }
  }
}

export default function Connect() {
  const toast = useStore((s) => s.toast)
  const setRoute = useStore((s) => s.setRoute)
  const clientOverride = useStore((s) => s.connectClientOverride)
  const brainTarget = useStore((s) => s.brainTarget)
  const setBrainTarget = useStore((s) => s.setBrainTarget)
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const setRemoteBrainUrl = useStore((s) => s.setRemoteBrainUrl)
  const connectToken = useStore((s) => s.connectToken)
  const setConnectToken = useStore((s) => s.setConnectToken)
  const simpleMode = useStore((s) => s.simpleMode)
  const agentBrainMode = useStore((s) => s.agentBrainMode)
  const setAgentBrainMode = useStore((s) => s.setAgentBrainMode)
  const labels = uiLabels()
  // Mini has no brain of its own, so 'embedded' is not a state it can be in.
  // Pinning it here rather than hiding the switch means a setting inherited
  // from a full install cannot leave Mini pointing at a server that is not
  // there — and every snippet it writes is a remote one, which is the only
  // kind that makes sense for it.
  const effectiveTarget: BrainTarget = resolveBrainTarget({
    mini: isMini,
    simpleMode,
    stored: brainTarget,
  })
  const urlEditable = canEditBrainUrl(effectiveTarget)
  /**
   * The legacy Python hub is gone; every remote brain is brain-core.
   *
   * The toggle that used to sit under this page generated configs for the
   * retired three-SSE architecture — three servers where there is now one
   * endpoint. Anyone who flipped it got MCP blocks pointing at ports that
   * stopped answering, which looks exactly like "Pomnia does not connect".
   * Pinned rather than read from the store so a setting saved back when the
   * hub existed cannot keep writing dead configs.
   */
  const remoteHub = 'brain-core' as const
  const brainUrl = effectiveTarget === 'embedded' ? EMBEDDED_URL : remoteBrainUrl
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [brainOk, setBrainOk] = useState<boolean | null>(null)
  const [brainDetail, setBrainDetail] = useState('')
  const [embeddedRunning, setEmbeddedRunning] = useState<boolean | null>(null)

  const [picked, setPicked] = useState<ClientId | null>(null)
  const [snippet, setSnippet] = useState<Snippet | null>(null)
  const [snippetLoading, setSnippetLoading] = useState(false)
  const [mode, setMode] = useState<'new' | 'merge'>('new')
  const [copied, setCopied] = useState<string | null>(null)
  const [minting, setMinting] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [seen, setSeen] = useState<{
    supported: boolean
    clients: { name: string; version?: string; lastSeen: number; connects: number }[]
  } | null>(null)
  const [writingBrief, setWritingBrief] = useState(false)

  /**
   * Mint a token without asking for a name in a dialog that does not exist.
   *
   * This used `window.prompt`, which Chromium disables inside Electron — so the
   * button answered every click with "prompt() is not supported" and could never
   * have worked, for anyone, on any platform this ships to.
   *
   * The name only has to be recognisable when revoking later, and the machine
   * already knows enough to produce one. A name typed into a box that is not
   * there is worth less than a token that appears.
   */
  async function mintToken() {
    if (minting) return
    const dashboardUrl = brainBaseUrl(brainUrl)
    const host = (() => {
      try {
        return new URL(brainUrl.includes('://') ? brainUrl : `http://${brainUrl}`).hostname
      } catch {
        return 'pomnia'
      }
    })()
    const name = `${host}-${new Date().toISOString().slice(0, 10)}`
    setMinting(true)
    try {
      // No token argument: main uses the stored admin token. What sat here
      // was `connectToken`, the agent token from the field beside the button,
      // which the server correctly refuses for creating tokens.
      const r = await api.connectMcpTokenCreate(dashboardUrl, name.trim())
      setConnectToken(r.token)
      toast({
        kind: 'success',
        title: labels.tokenCreatedTitle(r.name),
        detail: labels.tokenSavedDetail,
      })
      // Token is in React state async — pass explicitly for immediate rebuild.
      if (picked) {
        setSnippetLoading(true)
        try {
          setSnippet(
            await api.connectSnippet(picked, brainUrl, r.token, effectiveTarget, agentBrainMode, remoteHub)
          )
        } catch {
          /* ignore — user can re-pick */
        } finally {
          setSnippetLoading(false)
        }
      }
    } catch (e) {
      toast({
        kind: 'error',
        title: labels.tokenCreateFailed,
        detail: labels.tokenCreateFailedDetail((e as Error).message),
      })
    } finally {
      setMinting(false)
    }
  }

  const [syncing, setSyncing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [replica, setReplica] = useState<{
    url: string
    hasToken: boolean
    autoSync: boolean
    last: { at: string; ok: boolean; uploaded: number; unchanged: number; failed: number; error?: string } | null
  } | null>(null)

  // Pomnia's own liveness probe is not an agent and has read nothing, so it
  // does not belong in a list of agents that used the memory. Filtered on the
  // server too, from 0.1.79 — this keeps it out of sight on the servers
  // already running, which is every one of them today.
  const visibleSeen = (seen?.clients ?? []).filter((c) => c.name.toLowerCase() !== 'pomnia-status-probe')

  // Whatever the admin token turns out to be, it lives in main. The renderer
  // learns only `replica.hasToken` back, so a stored one cannot be read out
  // of the window.
  const [adopting, setAdopting] = useState(false)
  const [showManual, setShowManual] = useState(false)

  /**
   * One field, one paste, and the server settles what the token is.
   *
   * Mini asked for two tokens in two identical password boxes and left the
   * person to know which was which — a distinction the app itself got wrong in
   * code. An admin token is stored in main and never comes back here; an agent
   * token is minted from it in the same step, because building the snippet is
   * the only reason this page needs one.
   */
  async function adoptToken(raw: string) {
    const t = raw.trim()
    if (!t || adopting) return
    setAdopting(true)
    try {
      const r = await api.connectTokenAdopt(brainUrl, t)
      if (r.role === 'unreachable') {
        toast({ kind: 'error', title: labels.tokenAdoptUnreachable, detail: r.detail })
        return
      }
      if (r.role === 'admin') {
        setReplica(await api.vaultReplicaState())
        if (r.agentToken) {
          setConnectToken(r.agentToken)
          toast({ kind: 'success', title: labels.tokenAdoptAdmin, detail: labels.tokenAdoptAdminDetail })
        } else {
          // The admin token is stored and valid; only minting failed.
          toast({ kind: 'warn', title: labels.tokenAdoptAdminNoMint, detail: r.detail })
        }
      } else {
        setConnectToken(r.agentToken)
        toast({ kind: 'info', title: labels.tokenAdoptAgent, detail: labels.tokenAdoptAgentDetail })
      }
      await refreshSnippetIfPicked()
    } catch (e) {
      toast({ kind: 'error', title: labels.tokenAdoptFailed, detail: (e as Error).message })
    } finally {
      setAdopting(false)
    }
  }

  async function refresh() {
    setLoading(true)
    try {
      const [r, core] = await Promise.all([
        api.connectStatus(brainUrl, effectiveTarget === 'remote' ? connectToken || undefined : undefined, effectiveTarget),
        effectiveTarget === 'embedded' ? api.brainCoreStatus() : Promise.resolve(null),
      ])
      setClients(r.clients)
      setBrainOk(r.brain.reachable)
      setEmbeddedRunning(core?.running ?? null)
      const d = r.brain.data as Record<string, unknown> | undefined
      // Name the engine that answered. "reachable" alone hid the case that
      // matters: a saved URL pointing at the legacy Python brain still replies,
      // so the badge went green while search returned a months-old corpus.
      const engine = identifyEngine(d).label
      setBrainDetail(
        effectiveTarget === 'embedded' && core && !core.running
          ? labels.brainStoppedStartInTab
          : r.brain.reachable
            ? [
                engine,
                // Reachable and writable are different questions. A replica
                // answers every probe and then refuses every save — better to
                // read that here than from an agent's apology afterwards.
                d?.writable === false &&
                  (d?.vaultOwner
                    ? labels.brainReadOnlyBy(String(d.vaultOwner))
                    : labels.brainReadOnly),
                d?.notes && `${d.notes} notes`,
                d?.sessions && `${d.sessions} sessions`,
                d?.library_docs && `${d.library_docs} docs`,
              ]
                .filter(Boolean)
                .join(' · ') || (effectiveTarget === 'embedded' ? 'local MCP ready' : 'reachable')
            : r.brain.error || 'unreachable'
      )
    } catch (e) {
      toast({ kind: 'error', title: labels.statusCheckFailed, detail: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  function switchTarget(next: BrainTarget) {
    setBrainTarget(next)
    setPicked(null)
    setSnippet(null)
    // Switching to a remote with nothing saved leaves every client pointed at
    // an empty address. The checklist above already tracks this, but say it
    // at the moment of the switch rather than waiting to be noticed.
    if (next === 'remote' && !remoteBrainUrl.trim()) {
      toast({
        kind: 'warn',
        title: labels.connectStepUrl,
        detail: labels.onboardingEngineRemoteUntested,
      })
    }
    // Prefer server Ollama for distill when Master is remote and URL still points
    // at localhost (or empty) — search does not need a local install.
    if (next === 'remote' && remoteBrainUrl.trim()) {
      const current = useStore.getState().ollamaUrl.trim()
      if (!current || /127\.0\.0\.1:11434|localhost:11434/i.test(current)) {
        useStore.getState().setOllamaUrl(ollamaUrlFromBrainUrl(remoteBrainUrl.trim()))
      }
    }
  }

  // Replication state is independent of which brain is selected — the machine
  // that owns the vault has something to mirror either way.
  // Who has actually connected, from the server rather than from a list of
  // clients somebody wrote code for. Mini only: the full app still shows its
  // own scan, and two answers to one question on one screen would be worse
  // than either.
  useEffect(() => {
    if (!isMini) return
    let alive = true
    const load = (): void => {
      void api
        .mcpSeenClients(brainUrl, effectiveTarget === 'remote' ? connectToken || undefined : undefined)
        .then((r) => {
          if (alive) setSeen(r)
        })
        .catch(() => {
          if (alive) setSeen({ supported: false, clients: [] })
        })
    }
    load()
    const t = window.setInterval(load, 20_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainUrl, connectToken, effectiveTarget])

  useEffect(() => {
    void api.vaultReplicaState().then(setReplica).catch(() => setReplica(null))
  }, [])

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brainTarget, brainUrl])

  async function pick(id: ClientId) {
    const c = clients.find((x) => x.id === id)
    setPicked(id)
    setMode(c && c.state !== 'not_wired' ? 'merge' : 'new')
    setSnippet(null)
    setSnippetLoading(true)
    try {
      setSnippet(await api.connectSnippet(id, brainUrl, effectiveTarget === 'remote' ? connectToken || undefined : undefined, effectiveTarget, agentBrainMode, remoteHub))
    } catch (e) {
      toast({ kind: 'error', title: labels.snippetBuildFailed, detail: (e as Error).message })
    } finally {
      setSnippetLoading(false)
    }
  }

  // Re-build snippet after mint / when user finishes editing URL or token.
  async function refreshSnippetIfPicked() {
    if (!picked) return
    void pick(picked)
  }

  useEffect(() => {
    if (picked) void pick(picked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentBrainMode])

  async function copy(text: string, key: string, label: string) {
    // A rejected clipboard write used to leave no trace at all — no tick, no
    // toast, no error — so the snippet looked copied and the paste was stale.
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      toast({ kind: 'error', title: labels.copyFailed, detail: (e as Error).message })
      return
    }
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    toast({ kind: 'success', title: labels.copied, detail: label })
  }

  async function writeBrief() {
    if (!picked || !snippet?.brief || writingBrief) return
    setWritingBrief(true)
    try {
      const r = await api.connectWriteBrief(picked)
      if (!r.ok) {
        toast({
          kind: 'error',
          title: labels.agentBrainModeBriefWriteFailed,
          detail: r.detail || r.error,
        })
        return
      }
      setCopied('brain-rule-write')
      window.setTimeout(() => setCopied((c) => (c === 'brain-rule-write' ? null : c)), 1600)
      toast({
        kind: 'success',
        title: labels.agentBrainModeBriefWritten,
        detail: r.path,
      })
    } catch (e) {
      toast({
        kind: 'error',
        title: labels.agentBrainModeBriefWriteFailed,
        detail: (e as Error).message,
      })
    } finally {
      setWritingBrief(false)
    }
  }

  /**
   * Push the vault to the replica. The toast is written by the main process,
   * which is the side that knows how many files actually moved.
   */
  async function pushVault() {
    const target = replica?.url?.trim() || remoteBrainUrl.trim()
    if (!target) {
      toast({ kind: 'warn', title: labels.vaultReplicaFailed, detail: labels.vaultReplicaNoUrl })
      return
    }
    setPushing(true)
    try {
      await api.vaultSyncToReplica(target, connectToken || undefined)
    } catch (e) {
      toast({ kind: 'error', title: labels.vaultReplicaFailed, detail: (e as Error).message })
    } finally {
      setPushing(false)
      // Whatever happened, the recorded outcome is the thing worth showing.
      void api.vaultReplicaState().then(setReplica).catch(() => {})
    }
  }

  async function setAutoSync(on: boolean) {
    try {
      await api.vaultReplicaConfig({ autoSync: on })
      setReplica(await api.vaultReplicaState())
    } catch (e) {
      toast({ kind: 'error', title: labels.vaultReplicaFailed, detail: (e as Error).message })
    }
  }

  async function saveReplicaUrl(url: string) {
    try {
      await api.vaultReplicaConfig({ url })
      setReplica(await api.vaultReplicaState())
    } catch (e) {
      toast({ kind: 'error', title: labels.vaultReplicaFailed, detail: (e as Error).message })
    }
  }


  // Default to showing only clients we actually detect on disk; the user can
  // override per-client in Settings (pin a not-yet-installed one, or hide one).
  const isDetected = (id: ClientId) => !!clients.find((c) => c.id === id)?.configExists
  const isVisible = (id: ClientId) => clientOverride[id] ?? isDetected(id)
  const visibleClients = CLIENT_ORDER.filter(isVisible)
  const hiddenCount = CLIENT_ORDER.length - visibleClients.length
  const connectedCount = visibleClients.filter((id) => clients.find((c) => c.id === id)?.state === 'wired').length
  const dashboardUrl = effectiveTarget === 'remote' && brainUrl ? brainBaseUrl(brainUrl) : ''
  const partialClients = clients.filter((c) => c.state === 'partial' && isVisible(c.id))
  // The same three shapes the prompt tells an agent to choose between,
  // for the person who would rather open the file themselves. Mini removed
  // the per-client snippets, and with them every manual route — leaving one
  // path that only works if you have an agent open and it cooperates.
  const generic = buildGenericSnippet(
    effectiveTarget === 'embedded' ? EMBEDDED_URL : remoteBrainUrl,
    effectiveTarget === 'remote' ? connectToken || undefined : undefined,
    api.platform === 'darwin' ? 'darwin' : api.platform === 'linux' ? 'linux' : 'win32',
  )
  const agentPrompt = buildAgentSetupPrompt(
    effectiveTarget === 'embedded' ? EMBEDDED_URL : remoteBrainUrl,
    effectiveTarget === 'remote' ? connectToken || undefined : undefined,
    api.platform === 'darwin' ? 'darwin' : api.platform === 'linux' ? 'linux' : 'win32',
  )

  const checklistDone = {
    url: effectiveTarget === 'embedded' || !!remoteBrainUrl.trim(),
    token: effectiveTarget === 'embedded' || !!connectToken.trim(),
    copy: copied === 'code' || copied === 'mcp-full' || copied === 'agent-prompt',
    reload: connectedCount > 0,
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <Plug className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.mcpConnect}</h1>
          <p className="text-sm text-ink-dim">
            {isMini ? labels.connectPageLeadMini : labels.connectPageLead}
          </p>
          {/* The doc link explains editing config files by hand — the thing Mini
              exists to make unnecessary. */}
          {!isMini && (
            <p className="mt-1 text-[11px] text-ink-faint">{labels.connectMacNoAppHint}</p>
          )}
        </div>
      </div>

      {/*
        The general way in: one instruction the user pastes into whatever agent
        they are already talking to, which then edits its own config and proves
        the connection by calling a tool. Every per-client spec in this app
        exists to save that paste; none of them is what makes MCP work. An
        agent released tomorrow is covered by this and by nothing else.

        Shown in both builds, and first. The per-client cards below it are a
        shortcut for the six clients someone wrote code for; this is the
        method, and it is the only thing on the page that covers a client
        nobody has heard of yet.
      */}
      {effectiveTarget === 'remote' && (
        <GlassCard className="mb-5 p-5">
          {/* In Mini the page header two lines above already says what this
              does. The full app's header talks about per-client configs, so
              there the card has to say it itself. */}
          {!isMini && (
            <p className="mb-3 text-xs leading-relaxed text-ink-dim">{labels.agentPromptLeadFull}</p>
          )}
          {/*
            Collapsed by default. The instruction is sixty lines of monospace
            written for a machine to act on, and it is meant to be copied, not
            read — leaving it open makes one action look like a document.
          */}
          {showPrompt && (
            <pre className="mb-3 max-h-64 overflow-auto rounded-xl border border-white/8 bg-black/30 p-3 text-[11px] leading-relaxed text-ink-dim">
              {agentPrompt}
            </pre>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(agentPrompt)
                setCopied('agent-prompt')
                window.setTimeout(() => setCopied(null), 1600)
              }}
            >
              <Copy className="h-4 w-4" />
              {copied === 'agent-prompt' ? labels.agentPromptCopied : labels.agentPromptCopy}
            </Button>
            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="no-drag text-[11px] font-medium text-iris hover:underline"
            >
              {showPrompt ? labels.agentPromptHide : labels.agentPromptShow}
            </button>
            <span className="text-[11px] text-amber">{labels.agentPromptSecret}</span>
          </div>

          {/*
            The manual route, deliberately quieter than the button above: it
            is the fallback, not a peer. But it has to exist — an agent that
            refuses, a client with no chat window, or simply someone who
            would rather edit the file, all end up here.
          */}
          {isMini && (
          <div className="mt-4 border-t border-white/8 pt-3">
            <button
              onClick={() => setShowManual((v) => !v)}
              className="no-drag text-[11px] font-medium text-ink-dim hover:text-ink"
            >
              {showManual ? labels.manualHide : labels.manualShow}
            </button>
            {showManual && (
              <div className="mt-3 space-y-3">
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  {labels.manualLead(generic.outerKey)}
                </p>
                {generic.variants.map((v) => (
                  <div key={v.id}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-ink-dim">{labels.manualWhen(v.id)}</span>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(v.json)
                          setCopied(`manual-${v.id}`)
                          window.setTimeout(() => setCopied(null), 1600)
                        }}
                        className="no-drag shrink-0 text-[11px] font-medium text-iris hover:underline"
                      >
                        {copied === `manual-${v.id}` ? labels.manualCopied : labels.manualCopy}
                      </button>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-white/8 bg-black/30 p-2.5 text-[11px] leading-relaxed text-ink-dim">
                      {v.json}
                    </pre>
                  </div>
                ))}
                <p className="text-[11px] leading-relaxed text-ink-faint">{labels.manualOuterKeyNote}</p>
              </div>
            )}
          </div>
          )}
        </GlassCard>
      )}

      {/* First-time checklist (remote) */}
      {!simpleMode && effectiveTarget === 'remote' && (
        <GlassCard className="mb-5 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="h-4 w-4 text-iris" /> {labels.connectChecklistTitle}
          </div>
          <ol className="space-y-2">
            <ChecklistRow done={checklistDone.url} label={labels.connectStepUrl} />
            <ChecklistRow done={checklistDone.token} label={labels.connectStepToken} />
            <ChecklistRow done={checklistDone.copy} label={labels.connectStepCopy} />
            <ChecklistRow done={checklistDone.reload} label={labels.connectStepReload} />
          </ol>
        </GlassCard>
      )}

      {/*
        Hidden in Mini: its only action is 'build me that client's snippet',
        which Mini does not do. The instruction above is the repair, and it is
        the same repair for every client.
      */}
      {!isMini && partialClients.length > 0 && (
        <GlassCard className="mb-5 border border-amber/30 bg-amber/5 p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber">
            <AlertTriangle className="h-4 w-4" /> {labels.connectPartialTitle}
          </div>
          <p className="mb-2 text-[12px] leading-relaxed text-ink-dim">{labels.connectPartialDetail}</p>
          <ul className="mb-3 space-y-1 text-[11px] text-ink-faint">
            {partialClients.map((c) => (
              <li key={c.id}>
                <strong className="text-ink-dim">{c.label}</strong>
                {c.issues.length ? ` — ${c.issues.filter((i) => i.includes('missing') || i.includes('incomplete')).join('; ')}` : ''}
              </li>
            ))}
          </ul>
          <Button
            variant="soft"
            onClick={() => {
              const id = (partialClients.find((c) => c.id === 'cursor') ?? partialClients[0]).id
              void pick(id)
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {labels.connectPartialFix}
          </Button>
        </GlassCard>
      )}

      {/* Brain server + URL */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {simpleMode && !isMini ? labels.embeddedBrain : labels.brainServer}
            </span>
            {brainOk !== null && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  color: brainOk ? '#34d399' : '#fb7185',
                  background: brainOk ? '#34d3991f' : '#fb71851f',
                  border: `1px solid ${brainOk ? '#34d39933' : '#fb718533'}`
                }}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${brainOk ? 'bg-mint' : 'bg-rose'}`} />
                {brainDetail}
              </span>
            )}
          </div>
          <Button variant="soft" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {/* Mini is remote by construction; offering the switch would offer a
            mode it cannot enter. */}
        {!simpleMode && !isMini && (
        <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
          <button
            onClick={() => switchTarget('embedded')}
            className={`no-drag rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              effectiveTarget === 'embedded' ? 'bg-iris/20 text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {labels.embedded}
          </button>
          <button
            onClick={() => switchTarget('remote')}
            className={`no-drag rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              effectiveTarget === 'remote' ? 'bg-iris/20 text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {labels.remote}
          </button>
        </div>
        )}

        {!isMini && effectiveTarget === 'embedded' && embeddedRunning === false && (
          <p className="mb-3 text-[11px] text-amber">
            {labels.embeddedBrainNotRunning}{' '}
            <button onClick={() => setRoute('brain')} className="no-drag font-medium text-iris hover:underline">
              {labels.embeddedBrainNotRunningLink}
            </button>{' '}
            {labels.embeddedBrainStartBeforeConnect}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/*
            Mini always shows these. `simpleMode` hides the address and token
            because the full app can fall back to a brain inside itself — Mini
            cannot, so hiding them leaves it saying "no server URL configured"
            with nowhere to configure one. That is what a fresh install did.
          */}
          {(!simpleMode || isMini) && (
          <Input
            value={brainUrl}
            onChange={(e) => {
              if (urlEditable) setRemoteBrainUrl(e.target.value)
            }}
            onBlur={() => void refreshSnippetIfPicked()}
            placeholder={effectiveTarget === 'embedded' ? EMBEDDED_URL : REMOTE_URL_PLACEHOLDER}
            className="w-64"
            readOnly={!urlEditable}
          />
          )}
          {(!simpleMode || isMini) && effectiveTarget === 'remote' && (
            <>
              <Input
                value={connectToken}
                onChange={(e) => setConnectToken(e.target.value)}
                onBlur={(e) => void (isMini ? adoptToken(e.target.value) : refreshSnippetIfPicked())}
                placeholder={isMini ? labels.tokenAnyPlaceholder : labels.connectTokenPlaceholder}
                type="password"
                className={isMini ? 'w-72' : 'w-56'}
              />
              {isMini ? (
                adopting && <Spinner className="h-3.5 w-3.5" />
              ) : (
                <Button variant="soft" onClick={() => void mintToken()} disabled={minting || !brainUrl.trim()}>
                  {minting ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {labels.mintTokenBtn}
                </Button>
              )}
              {dashboardUrl && (
                <Button
                  variant="soft"
                  onClick={() => window.open(dashboardUrl, '_blank', 'noopener,noreferrer')}
                >
                  <KeyRound className="h-3.5 w-3.5" /> {labels.connectOpenDashboard}
                </Button>
              )}
            </>
          )}
        </div>

        {/* One field above does both jobs now; what is left to say is which
            kind of token is currently in hand, because that decides whether
            the Brain-mode toggles below can reach the server at all. */}
        {isMini && effectiveTarget === 'remote' && (
          <p className="mt-2 text-[11px] text-ink-faint">
            {replica?.hasToken ? labels.tokenHaveAdmin : labels.tokenNoAdmin}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-ink-faint">
            {effectiveTarget === 'embedded'
              ? labels.embeddedSnippetHint
              : !connectToken.trim()
                ? // Mini has no 'create' button any more — pasting an admin
                  // token mints one — so the old wording pointed at nothing.
                  isMini
                  ? labels.connectTokenRequiredMini
                  : labels.connectTokenRequired
                : labels.urlChangeHint}
          </span>
        </div>
      </GlassCard>

      <GlassCard className="mb-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{labels.agentBrainMode}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{labels.agentBrainModeHint}</p>
            {/* The mechanics, one step quieter. They matter when something is
                wrong and are noise when it is not. */}
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
              {labels.agentBrainModeHintMore}
            </p>
          </div>
          <Toggle
            checked={agentBrainMode}
            onChange={setAgentBrainMode}
            aria-label={labels.agentBrainMode}
          />
        </div>
      </GlassCard>

      {/*
        Mini shows who actually connected, from the server. The grid below is
        a scan of seven config files somebody wrote code for, and it reports
        that a file parsed -- which has now meant nothing twice here: six
        clients green while answering 403, one green with a token the server
        rejects. This card is the other kind of evidence, and the only one that
        covers an agent released tomorrow.
      */}
      {isMini && (
        <GlassCard className="mb-5 p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="h-4 w-4 text-mint" /> {labels.seenClientsTitle}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-ink-dim">{labels.seenClientsLead}</p>
          {seen === null ? (
            <div className="flex items-center gap-2 text-xs text-ink-faint">
              <Spinner className="h-3.5 w-3.5" />
            </div>
          ) : !seen.supported ? (
            <p className="text-xs text-amber">{labels.seenClientsUnsupported}</p>
          ) : visibleSeen.length === 0 ? (
            <p className="text-xs text-ink-faint">{labels.seenClientsEmpty}</p>
          ) : (
            <div className="space-y-2">
              {visibleSeen.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink">{c.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {c.version ? `${formatClientVersion(c.version)} · ` : ''}
                      {labels.seenClientsConnects(c.connects)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {new Date(c.lastSeen).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Clients status grid — the config scan. Hidden in Mini: see above. */}
      {!isMini && (
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="h-4 w-4 text-cyan" /> {labels.connectYourClients}
          </div>
          <Badge color={connectedCount ? '#34d399' : '#9aa3bd'}>
            {labels.connectClientsConnected(connectedCount, visibleClients.length)}
          </Badge>
        </div>
        {loading && clients.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-ink-dim">
            <Spinner className="h-4 w-4" /> {labels.connectDetectingClients}
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-5 text-center">
            <p className="text-sm text-ink-dim">{labels.connectNoClientsDetected}</p>
            <p className="mt-1 text-[12px] text-ink-faint">
              {labels.connectNoClientsHintPrefix}{' '}
              <button onClick={() => setRoute('settings')} className="no-drag font-medium text-iris hover:underline">
                {labels.connectNoClientsHintLink}
              </button>
              {labels.connectNoClientsHintSuffix}
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {visibleClients.map((id) => {
            const c = clients.find((c) => c.id === id)
            const meta = stateMeta(c?.state ?? 'not_wired', labels)
            const active = picked === id
            const brand = CLIENT_BRAND[id]
            const wiredKeys = c?.servers.filter((s) => s.present).map((s) => s.key) ?? []
            return (
              <button
                key={id}
                onClick={() => void pick(id)}
                className={`no-drag flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                  active ? 'border-iris/60 bg-iris/10 ring-1 ring-iris/30' : 'border-white/8 bg-black/20 hover:bg-white/5'
                }`}
              >
                <ClientIcon id={id} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{c?.label ?? id}</div>
                  <div className="truncate text-[11px] text-ink-faint">
                    {c && c.state !== 'not_wired'
                      ? wiredKeys.length
                        ? wiredKeys.join(' · ')
                        : 'config present'
                      : brand.tagline}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5" style={{ color: meta.color }}>
                  <meta.Icon className="h-4 w-4" />
                  <span className="text-[11px] font-medium">{meta.label}</span>
                </div>
              </button>
            )
          })}
        </div>
        )}
        {visibleClients.length > 0 && hiddenCount > 0 && (
          <button
            onClick={() => setRoute('settings')}
            className="no-drag mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 px-4 py-2 text-[12px] text-ink-faint transition-colors hover:border-iris/40 hover:text-ink-dim"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {hiddenCount} other client{hiddenCount > 1 ? 's' : ''} hidden — manage in Settings
          </button>
        )}
      </GlassCard>
      )}

      {/*
        Mini does not build per-client snippets.

        Seven specs exist in this app to save a paste, and the instruction card
        above saves the same paste for every client including the ones nobody
        has written a spec for. Keeping both would mean two ways to do one
        thing, and the narrower one on top.

        The client list stays: knowing which agents are wired, and whether each
        one's own token is accepted, is information. Generating their files is
        machinery.
      */}
      {!isMini && picked && (
        <GlassCard className="mb-5 p-5">
          {snippetLoading || !snippet ? (
            <div className="flex items-center gap-2 text-sm text-ink-dim">
              <Spinner className="h-4 w-4" /> building snippet…
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <ClientIcon id={picked} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">Konfiguracja: {snippet.label}</div>
                  <div className="truncate text-[11px] text-ink-faint">{CLIENT_BRAND[picked].tagline}</div>
                </div>
                <Button
                  onClick={() =>
                    void copy(
                      snippet.fullFileJson,
                      'mcp-full',
                      labels.connectCopyForClient(snippet.label)
                    )
                  }
                  className="shrink-0"
                >
                  {copied === 'mcp-full' ? (
                    <Check className="h-3.5 w-3.5 text-mint" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {labels.connectCopyForClient(snippet.label)}
                </Button>
                <button
                  onClick={() => setPicked(null)}
                  className="no-drag rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/8 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {effectiveTarget === 'remote' && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Badge color="#22d3ee">pomnia</Badge>
                  <Badge color="#22d3ee">brain-vault</Badge>
                  <Badge color="#22d3ee">brain-library</Badge>
                </div>
              )}

              {/* Steps */}
              <ol className="mb-4 space-y-2.5">
                <Step n={1}>
                  {labels.connectSnippetOpenFile}
                  <button
                    onClick={() => void copy(snippet.filePath, 'path', labels.snippetFilePath)}
                    className="no-drag group ml-2 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1 align-middle text-[11px] text-ink-dim transition-colors hover:border-iris/40 hover:text-ink"
                  >
                    <span className="truncate">{snippet.filePath}</span>
                    {copied === 'path' ? (
                      <Check className="h-3 w-3 shrink-0 text-mint" />
                    ) : (
                      <Copy className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                    )}
                  </button>
                </Step>
                <Step n={2}>
                  {labels.connectSnippetChooseMode}
                </Step>
              </ol>

              {/* Segmented mode toggle */}
              <div className="mb-2.5 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                <SegBtn active={mode === 'new'} onClick={() => setMode('new')} Icon={FilePlus2}>
                  {labels.connectSnippetNewFile}
                </SegBtn>
                <SegBtn active={mode === 'merge'} onClick={() => setMode('merge')} Icon={GitMerge}>
                  {labels.connectSnippetMerge}
                </SegBtn>
              </div>

              {/* Code block */}
              <div className="relative mb-4">
                <button
                  onClick={() =>
                    void copy(
                      mode === 'new' ? snippet.fullFileJson : snippet.mergeJson,
                      'code',
                      mode === 'new' ? labels.snippetWholeFile : labels.connectSnippetMerge
                    )
                  }
                  className="no-drag absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-white/14"
                >
                  {copied === 'code' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-mint" /> {labels.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> {labels.connectCopyAction}
                    </>
                  )}
                </button>
                <p className="mb-1.5 text-[11px] text-ink-faint">
                  {mode === 'new'
                    ? labels.snippetPasteWhole
                    : labels.connectMergeKeysHint(snippet.mcpKey)}
                </p>
                <pre className="max-h-56 overflow-auto rounded-xl border border-white/8 bg-black/40 p-3.5 pt-9 text-[11px] leading-relaxed text-cyan">
                  {mode === 'new' ? snippet.fullFileJson : snippet.mergeJson}
                </pre>
              </div>

              {/* Step 3 + notes */}
              <ol className="mb-3 space-y-2.5">
                <Step n={3}>{snippet.restartHint}</Step>
              </ol>

              <div className="flex items-start gap-2 rounded-xl border border-cyan/20 bg-cyan/5 px-3 py-2.5">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
                <p className="text-[11px] leading-relaxed text-ink-dim">{snippet.notes}</p>
              </div>

              {agentBrainMode && (snippet.brief || snippet.agentRuleMarkdown) && (
                <div className="mt-4 rounded-xl border border-mint/25 bg-mint/5 p-3.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{labels.agentBrainModeBriefTitle}</div>
                    <div className="flex flex-wrap gap-2">
                      {snippet.brief ? (
                        <Button
                          variant="soft"
                          disabled={writingBrief}
                          onClick={() => void writeBrief()}
                        >
                          {writingBrief ? (
                            <Spinner className="h-3.5 w-3.5" />
                          ) : copied === 'brain-rule-write' ? (
                            <Check className="h-3.5 w-3.5 text-mint" />
                          ) : (
                            <FilePlus2 className="h-3.5 w-3.5" />
                          )}
                          {labels.agentBrainModeBriefWrite}
                        </Button>
                      ) : null}
                      <Button
                        variant="soft"
                        onClick={() =>
                          void copy(
                            snippet.brief?.content ?? snippet.agentRuleMarkdown ?? '',
                            'brain-rule',
                            labels.agentBrainModeBriefTitle,
                          )
                        }
                      >
                        {copied === 'brain-rule' ? (
                          <Check className="h-3.5 w-3.5 text-mint" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {snippet.brief ? labels.agentBrainModeBriefCopy : labels.agentBrainModeRuleCopy}
                      </Button>
                    </div>
                  </div>
                  {snippet.brief ? (
                    <p className="mb-2 text-[11px] text-ink-dim">
                      {snippet.brief.mode === 'append-to-existing' ? 'Dopisz / upsert: ' : labels.snippetCreateOverwrite}
                      <button
                        type="button"
                        onClick={() => void copy(snippet.brief!.filePath, 'brief-path', labels.snippetRulePath)}
                        className="no-drag font-mono text-cyan hover:underline"
                      >
                        {snippet.brief.filePath}
                      </button>
                      <span className="text-ink-faint"> — {snippet.brief.restartHint}</span>
                    </p>
                  ) : (
                    <p className="mb-2 text-[11px] text-ink-dim">{labels.agentBrainModeNoPath}</p>
                  )}
                  <p className="mb-2 text-[11px] leading-relaxed text-ink-faint">
                    {labels.agentBrainModeRefreshHint}
                  </p>
                  <pre className="max-h-40 overflow-auto rounded-lg border border-white/8 bg-black/40 p-3 text-[11px] leading-relaxed text-ink-dim">
                    {snippet.brief?.content ?? snippet.agentRuleMarkdown}
                  </pre>
                </div>
              )}

              <div className="mt-2 flex items-start gap-2 px-1">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  {effectiveTarget === 'embedded'
                    ? labels.snippetLocalModeHint
                    : connectToken
                      ? labels.snippetRemoteBrainCoreHint
                      : labels.connectTokenRequired}
                </p>
              </div>
            </>
          )}
        </GlassCard>
      )}


      {/*
        Vault replication — deliberately NOT gated on the engine target.
        Which brain answers your searches and where you keep a copy are
        different questions; gating this on `remote` hid the card in exactly
        the normal case — a desktop running its own brain, mirroring to a
        server — so auto-sync could never be switched on by the machine that
        actually owns the vault. Simple mode still hides it, because it hides
        every server-shaped control.
        Hidden in Mini for a blunter reason: Mini has no vault, so there is
        nothing here to replicate and its address field would configure a
        transfer that can never run.
      */}
      {!simpleMode && !isMini && (
        <GlassCard className="mt-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UploadCloud className="h-4 w-4 text-mint" /> {labels.vaultReplicaTitle}
            </div>
            <Badge color="#9aa3bd">{labels.vaultReplicaBadge}</Badge>
          </div>
          <p className="mb-3 text-xs text-ink-faint">{labels.vaultReplicaLead}</p>

          {/* Which credential the push will actually use. It was invisible, and
              the fallback is an agent token that cannot write — so the button
              failed with a server error about admin roles while the panel looked
              fully configured. */}
          <p
            className={
              replica?.hasToken
                ? 'mb-3 text-xs text-ink-faint'
                : 'mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200'
            }
          >
            {replica?.hasToken ? labels.vaultReplicaTokenOwn : labels.vaultReplicaTokenBorrowed}
          </p>

          <Field label={labels.vaultReplicaUrl}>
            <Input
              value={replica?.url ?? ''}
              // Typing here before the replica state has loaded used to be
              // discarded, because the updater returned the null it was given.
              // Same silent field as above; seed a blank config instead.
              onChange={(e) =>
                setReplica((r) => ({
                  hasToken: false,
                  autoSync: false,
                  last: null,
                  ...(r ?? {}),
                  url: e.target.value,
                }))
              }
              onBlur={(e) => void saveReplicaUrl(e.target.value)}
              placeholder="https://brain.example.com"
            />
          </Field>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3.5 py-2.5">
            <div>
              <div className="text-[13px] text-ink">{labels.vaultReplicaAuto}</div>
              <p className="mt-0.5 text-[11px] text-ink-faint">{labels.vaultReplicaAutoHint}</p>
            </div>
            <Toggle checked={replica?.autoSync === true} onChange={(v) => void setAutoSync(v)} />
          </div>

          {/* The reason auto-sync is allowed to exist at all: its outcome is
              on screen, including — especially — when it failed. */}
          {replica?.last && (
            <div
              className={
                replica.last.ok
                  ? 'mt-3 rounded-xl border border-mint/20 bg-mint/5 px-3.5 py-2.5 text-[11px] text-ink-dim'
                  : 'mt-3 rounded-xl border border-amber/25 bg-amber/10 px-3.5 py-2.5 text-[11px] text-amber-100'
              }
            >
              <span className="font-semibold text-ink">{labels.vaultReplicaLast}</span>{' '}
              {new Date(replica.last.at).toLocaleString(getUiLocale() === 'en' ? 'en-GB' : 'pl-PL')} ·{' '}
              {replica.last.ok
                ? labels.vaultReplicaLastOk(replica.last.uploaded, replica.last.unchanged)
                : (replica.last.error ?? labels.vaultReplicaFailed)}
            </div>
          )}

          <div className="mt-3">
            <Button onClick={() => void pushVault()} disabled={pushing}>
              {pushing ? <Spinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
              {labels.vaultReplicaAction}
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  )
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-[13px]">
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-mint" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-ink-faint" />
      )}
      <span className={done ? 'text-ink-dim' : 'text-ink-faint'}>{label}</span>
    </li>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris/15 text-[11px] font-bold text-iris">
        {n}
      </span>
      <div className="text-[13px] leading-relaxed text-ink-dim">{children}</div>
    </li>
  )
}

function SegBtn({
  active,
  onClick,
  Icon,
  children
}: {
  active: boolean
  onClick: () => void
  Icon: typeof FilePlus2
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`no-drag inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        active ? 'bg-iris/20 text-ink' : 'text-ink-faint hover:text-ink-dim'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}
