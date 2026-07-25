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
  X
} from 'lucide-react'
import { Badge, Button, GlassCard, Input, Spinner, Toggle } from '../components/ui'
import { ClientIcon, CLIENT_BRAND } from '../components/ClientIcon'
import {
  EMBEDDED_BRAIN_DEFAULT_URL,
  REMOTE_BRAIN_URL_PLACEHOLDER,
} from '@core/brain/snippet'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore, dashboardUrlFromBrainUrl } from '../store/useStore'
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

function stateMeta(state: WiredState): { label: string; color: string; Icon: typeof CheckCircle2 } {
  switch (state) {
    case 'wired':
      return { label: 'Połączony', color: '#34d399', Icon: CheckCircle2 }
    case 'partial':
      return { label: 'Niepełny', color: '#fbbf24', Icon: AlertTriangle }
    case 'config_error':
      return { label: 'Błąd config', color: '#fb7185', Icon: AlertTriangle }
    default:
      return { label: 'Brak', color: '#5b6178', Icon: Circle }
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
  const effectiveTarget: BrainTarget = simpleMode ? 'embedded' : brainTarget
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
  const [writingBrief, setWritingBrief] = useState(false)

  async function mintToken() {
    if (minting) return
    const dashboardUrl = dashboardUrlFromBrainUrl(brainUrl)
    const suggested = `pomnia-${new Date().toISOString().slice(0, 10)}`
    const name = window.prompt(
      'Nazwa tokena (np. macbook, windows — ułatwia późniejsze odwołanie):',
      suggested,
    )
    if (!name) return
    setMinting(true)
    try {
      const r = await api.connectMcpTokenCreate(dashboardUrl, name.trim(), connectToken || undefined)
      setConnectToken(r.token)
      toast({
        kind: 'success',
        title: `Token: ${r.name}`,
        detail: 'Zapisany w polu — snippet odświeży się automatycznie.',
      })
      // Token is in React state async — pass explicitly for immediate rebuild.
      if (picked) {
        setSnippetLoading(true)
        try {
          setSnippet(
            await api.connectSnippet(picked, brainUrl, r.token, effectiveTarget, agentBrainMode)
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
        title: 'Nie udało się utworzyć tokena',
        detail: `${(e as Error).message} — otwórz dashboard :7860 i wklej token ręcznie.`,
      })
    } finally {
      setMinting(false)
    }
  }

  const [syncing, setSyncing] = useState(false)

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
      setBrainDetail(
        brainTarget === 'embedded' && core && !core.running
          ? 'embedded brain stopped — start in Brain tab'
          : r.brain.reachable
            ? [d?.notes && `${d.notes} notes`, d?.sessions && `${d.sessions} sessions`, d?.library_docs && `${d.library_docs} docs`]
                .filter(Boolean)
                .join(' · ') || (effectiveTarget === 'embedded' ? 'local MCP ready' : 'reachable')
            : r.brain.error || 'unreachable'
      )
    } catch (e) {
      toast({ kind: 'error', title: 'Could not check status', detail: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  function switchTarget(next: BrainTarget) {
    setBrainTarget(next)
    const url = next === 'embedded' ? EMBEDDED_URL : remoteBrainUrl
    setPicked(null)
    setSnippet(null)
  }

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
      setSnippet(await api.connectSnippet(id, brainUrl, effectiveTarget === 'remote' ? connectToken || undefined : undefined, effectiveTarget, agentBrainMode))
    } catch (e) {
      toast({ kind: 'error', title: 'Nie udało się zbudować snippeta', detail: (e as Error).message })
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
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    toast({ kind: 'success', title: 'Skopiowano', detail: label })
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

  async function syncSkills() {
    setSyncing(true)
    try {
      // Skills live on the dashboard (:7860), not the MCP gateway/auth-proxy
      // (:7862) that brainUrl normally points at for client status + snippets —
      // two different services on two different ports. Derive by convention.
      const skillsDash = dashboardUrlFromBrainUrl(brainUrl)
      const r = await api.connectSkillsSync(skillsDash, connectToken || undefined)
      toast(
        r.errors.length
          ? { kind: 'warn', title: `Zsynchronizowano ${r.written} skill(i)`, detail: `${r.errors.length} błąd(ów) — konsola` }
          : r.written === 0
            ? { kind: 'info', title: 'Brak skilli', detail: 'Serwer Brain nie ma jeszcze skilli.' }
            : { kind: 'success', title: `Zsynchronizowano ${r.written} skill(i)`, detail: 'Dostępne offline.' }
      )
      if (r.errors.length) console.warn('skill sync errors', r.errors)
    } catch (e) {
      toast({ kind: 'error', title: 'Sync skilli nieudany', detail: (e as Error).message })
    } finally {
      setSyncing(false)
    }
  }

  // Default to showing only clients we actually detect on disk; the user can
  // override per-client in Settings (pin a not-yet-installed one, or hide one).
  const isDetected = (id: ClientId) => !!clients.find((c) => c.id === id)?.configExists
  const isVisible = (id: ClientId) => clientOverride[id] ?? isDetected(id)
  const visibleClients = CLIENT_ORDER.filter(isVisible)
  const hiddenCount = CLIENT_ORDER.length - visibleClients.length
  const connectedCount = visibleClients.filter((id) => clients.find((c) => c.id === id)?.state === 'wired').length
  const dashboardUrl = effectiveTarget === 'remote' && brainUrl ? dashboardUrlFromBrainUrl(brainUrl) : ''
  const partialClients = clients.filter((c) => c.state === 'partial' && isVisible(c.id))
  const checklistDone = {
    url: effectiveTarget === 'embedded' || !!remoteBrainUrl.trim(),
    token: effectiveTarget === 'embedded' || !!connectToken.trim(),
    copy: copied === 'code' || copied === 'mcp-full',
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
          <p className="text-sm text-ink-dim">{labels.connectPageLead}</p>
          <p className="mt-1 text-[11px] text-ink-faint">{labels.connectMacNoAppHint}</p>
        </div>
      </div>

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

      {/* Incomplete mcp.json warning */}
      {partialClients.length > 0 && (
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
              {simpleMode ? labels.embeddedBrain : labels.brainServer}
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

        {!simpleMode && (
        <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
          <button
            onClick={() => switchTarget('embedded')}
            className={`no-drag rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              brainTarget === 'embedded' ? 'bg-iris/20 text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {labels.embedded}
          </button>
          <button
            onClick={() => switchTarget('remote')}
            className={`no-drag rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              brainTarget === 'remote' ? 'bg-iris/20 text-ink' : 'text-ink-faint hover:text-ink-dim'
            }`}
          >
            {labels.remote}
          </button>
        </div>
        )}

        {(brainTarget === 'embedded' || simpleMode) && embeddedRunning === false && (
          <p className="mb-3 text-[11px] text-amber">
            {labels.embeddedBrainNotRunning}{' '}
            <button onClick={() => setRoute('brain')} className="no-drag font-medium text-iris hover:underline">
              {labels.embeddedBrainNotRunningLink}
            </button>{' '}
            i naciśnij Start, zanim klienci będą mogli się połączyć.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {!simpleMode && (
          <Input
            value={brainUrl}
            onChange={(e) => {
              if (brainTarget === 'remote') setRemoteBrainUrl(e.target.value)
            }}
            onBlur={() => void refreshSnippetIfPicked()}
            placeholder={brainTarget === 'embedded' ? EMBEDDED_URL : REMOTE_URL_PLACEHOLDER}
            className="w-64"
            readOnly={brainTarget === 'embedded'}
          />
          )}
          {!simpleMode && brainTarget === 'remote' && (
            <>
              <Input
                value={connectToken}
                onChange={(e) => setConnectToken(e.target.value)}
                onBlur={() => void refreshSnippetIfPicked()}
                placeholder={labels.connectTokenPlaceholder}
                type="password"
                className="w-56"
              />
              <Button variant="soft" onClick={() => void mintToken()} disabled={minting || !brainUrl.trim()}>
                {minting ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                Nowy token
              </Button>
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
          <span className="text-[11px] text-ink-faint">
            {simpleMode || brainTarget === 'embedded'
              ? 'Snippety wskazują na localhost — jeden serwer MCP, bez tokena.'
              : !connectToken.trim()
                ? labels.connectTokenRequired
                : 'Zmiana URL/tokena odświeża snippet automatycznie.'}
          </span>
        </div>
      </GlassCard>

      <GlassCard className="mb-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{labels.agentBrainMode}</div>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{labels.agentBrainModeHint}</p>
          </div>
          <Toggle
            checked={agentBrainMode}
            onChange={setAgentBrainMode}
            aria-label={labels.agentBrainMode}
          />
        </div>
      </GlassCard>

      {/* Clients status grid */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ListChecks className="h-4 w-4 text-cyan" /> Your MCP clients
          </div>
          <Badge color={connectedCount ? '#34d399' : '#9aa3bd'}>
            {connectedCount}/{visibleClients.length} connected
          </Badge>
        </div>
        {loading && clients.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-ink-dim">
            <Spinner className="h-4 w-4" /> detecting clients…
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-5 text-center">
            <p className="text-sm text-ink-dim">No MCP clients detected on this machine.</p>
            <p className="mt-1 text-[12px] text-ink-faint">
              Pick the ones you use in{' '}
              <button onClick={() => setRoute('settings')} className="no-drag font-medium text-iris hover:underline">
                Settings → MCP clients
              </button>{' '}
              to set them up.
            </p>
          </div>
        ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {visibleClients.map((id) => {
            const c = clients.find((c) => c.id === id)
            const meta = stateMeta(c?.state ?? 'not_wired')
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

      {/* Snippet for the picked client */}
      {picked && (
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
                  Otwórz lub utwórz plik:
                  <button
                    onClick={() => void copy(snippet.filePath, 'path', 'ścieżka pliku')}
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
                  Wybierz tryb, skopiuj config i wklej:
                </Step>
              </ol>

              {/* Segmented mode toggle */}
              <div className="mb-2.5 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                <SegBtn active={mode === 'new'} onClick={() => setMode('new')} Icon={FilePlus2}>
                  Nowy / pusty plik
                </SegBtn>
                <SegBtn active={mode === 'merge'} onClick={() => setMode('merge')} Icon={GitMerge}>
                  Merge do istniejącego
                </SegBtn>
              </div>

              {/* Code block */}
              <div className="relative mb-4">
                <button
                  onClick={() =>
                    void copy(
                      mode === 'new' ? snippet.fullFileJson : snippet.mergeJson,
                      'code',
                      mode === 'new' ? 'pełny plik' : 'merge snippet'
                    )
                  }
                  className="no-drag absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-white/14"
                >
                  {copied === 'code' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-mint" /> Skopiowano
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Kopiuj
                    </>
                  )}
                </button>
                <p className="mb-1.5 text-[11px] text-ink-faint">
                  {mode === 'new'
                    ? 'Wklej jako całą zawartość pliku.'
                    : `Dodaj te klucze do obiektu "${snippet.mcpKey}".`}
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
                      {snippet.brief.mode === 'append-to-existing' ? 'Dopisz / upsert: ' : 'Utwórz / nadpisz: '}
                      <button
                        type="button"
                        onClick={() => void copy(snippet.brief!.filePath, 'brief-path', 'ścieżka reguły')}
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
                  {brainTarget === 'embedded'
                    ? 'Tryb lokalny: jeden serwer pomnia na /mcp — bez Bearer tokena.'
                    : connectToken
                      ? 'Token jest w headers — trzymaj plik prywatny (chmod 600).'
                      : labels.connectTokenRequired}
                </p>
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Skills sync — remote Brain dashboard (:7860) only */}
      {effectiveTarget === 'remote' && (
      <GlassCard className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-amber" /> Brain skills
          </div>
          <Badge color="#9aa3bd">offline-capable once synced</Badge>
        </div>
        <p className="mb-3 text-xs text-ink-faint">
          Pull workflow + expertise skills from your Brain server so they're available even when you're not on the
          LAN.
        </p>
        <Button onClick={() => void syncSkills()} disabled={syncing}>
          {syncing ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          Sync skills
        </Button>
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
