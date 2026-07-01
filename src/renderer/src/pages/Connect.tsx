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
import { Badge, Button, GlassCard, Input, Spinner } from '../components/ui'
import { ClientIcon, CLIENT_BRAND } from '../components/ClientIcon'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { ClientId, ClientStatus, Snippet, WiredState } from '../lib/types'

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
      return { label: 'Connected', color: '#34d399', Icon: CheckCircle2 }
    case 'partial':
      return { label: 'Partial', color: '#fbbf24', Icon: AlertTriangle }
    case 'config_error':
      return { label: 'Config error', color: '#fb7185', Icon: AlertTriangle }
    default:
      return { label: 'Not connected', color: '#5b6178', Icon: Circle }
  }
}

export default function Connect() {
  const toast = useStore((s) => s.toast)
  const setRoute = useStore((s) => s.setRoute)
  const clientOverride = useStore((s) => s.connectClientOverride)
  const [brainUrl, setBrainUrl] = useState('http://brain.example.local:7862')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [brainOk, setBrainOk] = useState<boolean | null>(null)
  const [brainDetail, setBrainDetail] = useState('')

  const [picked, setPicked] = useState<ClientId | null>(null)
  const [snippet, setSnippet] = useState<Snippet | null>(null)
  const [snippetLoading, setSnippetLoading] = useState(false)
  const [mode, setMode] = useState<'new' | 'merge'>('new')
  const [copied, setCopied] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.connectStatus(brainUrl, token || undefined)
      setClients(r.clients)
      setBrainOk(r.brain.reachable)
      const d = r.brain.data as Record<string, unknown> | undefined
      setBrainDetail(
        r.brain.reachable
          ? [d?.notes && `${d.notes} notes`, d?.sessions && `${d.sessions} sessions`, d?.library_docs && `${d.library_docs} docs`]
              .filter(Boolean)
              .join(' · ') || 'reachable'
          : r.brain.error || 'unreachable'
      )
    } catch (e) {
      toast({ kind: 'error', title: 'Could not check status', detail: (e as Error).message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick(id: ClientId) {
    const c = clients.find((x) => x.id === id)
    setPicked(id)
    setMode(c && c.state !== 'not_wired' ? 'merge' : 'new')
    setSnippet(null)
    setSnippetLoading(true)
    try {
      setSnippet(await api.connectSnippet(id, brainUrl, token || undefined))
    } catch (e) {
      toast({ kind: 'error', title: 'Could not build snippet', detail: (e as Error).message })
    } finally {
      setSnippetLoading(false)
    }
  }

  async function copy(text: string, key: string, label: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    toast({ kind: 'success', title: 'Copied', detail: label })
  }

  async function syncSkills() {
    setSyncing(true)
    try {
      // Skills live on the dashboard (:7860), not the MCP gateway/auth-proxy
      // (:7862) that brainUrl normally points at for client status + snippets —
      // two different services on two different ports. Derive by convention.
      const dashboardUrl = brainUrl.replace(/:7862\b/, ':7860')
      const r = await api.connectSkillsSync(dashboardUrl, token || undefined)
      toast({
        kind: r.errors.length ? 'warn' : 'success',
        title: `Synced ${r.written} skill(s)`,
        detail: r.errors.length ? `${r.errors.length} error(s) — see console` : 'Available offline now.'
      })
      if (r.errors.length) console.warn('skill sync errors', r.errors)
    } catch (e) {
      toast({ kind: 'error', title: 'Skill sync failed', detail: (e as Error).message })
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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <Plug className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">Connect to Brain</h1>
          <p className="text-sm text-ink-dim">
            See what's wired up, and get a copy-paste snippet for what isn't — we never touch your config files.
          </p>
        </div>
      </div>

      {/* Brain server + URL */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">Brain server</span>
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
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={brainUrl}
            onChange={(e) => setBrainUrl(e.target.value)}
            placeholder="http://brain.example.local:7862"
            className="w-64"
          />
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token (optional)"
            type="password"
            className="w-56"
          />
          <span className="text-[11px] text-ink-faint">
            Changing the URL or token? Hit Refresh, then re-pick a client.
          </span>
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
                  <div className="text-sm font-semibold text-ink">Set up {snippet.label}</div>
                  <div className="truncate text-[11px] text-ink-faint">{CLIENT_BRAND[picked].tagline}</div>
                </div>
                <button
                  onClick={() => setPicked(null)}
                  className="no-drag rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/8 hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Steps */}
              <ol className="mb-4 space-y-2.5">
                <Step n={1}>
                  Open or create this file:
                  <button
                    onClick={() => void copy(snippet.filePath, 'path', 'file path')}
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
                  Pick your case, then copy the config and paste it in:
                </Step>
              </ol>

              {/* Segmented mode toggle */}
              <div className="mb-2.5 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                <SegBtn active={mode === 'new'} onClick={() => setMode('new')} Icon={FilePlus2}>
                  New / empty file
                </SegBtn>
                <SegBtn active={mode === 'merge'} onClick={() => setMode('merge')} Icon={GitMerge}>
                  Merge into existing
                </SegBtn>
              </div>

              {/* Code block */}
              <div className="relative mb-4">
                <button
                  onClick={() =>
                    void copy(
                      mode === 'new' ? snippet.fullFileJson : snippet.mergeJson,
                      'code',
                      mode === 'new' ? 'full file' : 'merge snippet'
                    )
                  }
                  className="no-drag absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-white/14"
                >
                  {copied === 'code' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-mint" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
                <p className="mb-1.5 text-[11px] text-ink-faint">
                  {mode === 'new'
                    ? 'Paste as the entire file content.'
                    : `Merge these keys into the "${snippet.mcpKey}" object you already have.`}
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

              <div className="mt-2 flex items-start gap-2 px-1">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" />
                <p className="text-[11px] leading-relaxed text-ink-faint">
                  {token
                    ? 'Token is baked into the headers — keep this file private (chmod 600 if possible).'
                    : 'No token added. If your Brain proxy is auth-gated, paste a token above first, then re-copy.'}
                </p>
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Skills sync */}
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
    </div>
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
