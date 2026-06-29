import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  ListChecks,
  Plug,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { Badge, Button, GlassCard, Input, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { ClientId, ClientStatus, Snippet, WiredState } from '../lib/types'

const CLIENT_ORDER: { id: ClientId; emoji: string }[] = [
  { id: 'claude-code', emoji: '💻' },
  { id: 'cursor', emoji: '✦' },
  { id: 'antigravity', emoji: '🚀' },
  { id: 'claude-desktop', emoji: '🤖' },
  { id: 'vscode', emoji: '📝' },
  { id: 'windsurf', emoji: '🌊' }
]

function stateMeta(state: WiredState): { label: string; color: string; Icon: typeof CheckCircle2 } {
  switch (state) {
    case 'wired':
      return { label: 'Connected', color: '#34d399', Icon: CheckCircle2 }
    case 'partial':
      return { label: 'Partially wired', color: '#fbbf24', Icon: AlertTriangle }
    case 'config_error':
      return { label: 'Config error', color: '#fb7185', Icon: AlertTriangle }
    default:
      return { label: 'Not connected', color: '#5b6178', Icon: Circle }
  }
}

export default function Connect() {
  const toast = useStore((s) => s.toast)
  const [brainUrl, setBrainUrl] = useState('http://brain.example.local:7862')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [brainOk, setBrainOk] = useState<boolean | null>(null)
  const [brainDetail, setBrainDetail] = useState('')

  const [picked, setPicked] = useState<ClientId | null>(null)
  const [snippet, setSnippet] = useState<Snippet | null>(null)
  const [snippetLoading, setSnippetLoading] = useState(false)

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
              .join(' · ')
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
    setPicked(id)
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

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text)
    toast({ kind: 'success', title: 'Copied', detail: label })
  }

  async function syncSkills() {
    setSyncing(true)
    try {
      const r = await api.connectSkillsSync(brainUrl, token || undefined)
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
          <span className="text-sm font-semibold text-ink">Brain server</span>
          <Button variant="soft" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={brainUrl} onChange={(e) => setBrainUrl(e.target.value)} placeholder="http://brain.example.local:7862" className="w-64" />
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token (optional)"
            type="password"
            className="w-56"
          />
          {brainOk !== null && (
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${brainOk ? 'bg-mint' : 'bg-rose'}`} />
              <span className="text-sm text-ink-dim">{brainDetail}</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Clients status */}
      <GlassCard className="mb-5 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ListChecks className="h-4 w-4 text-cyan" /> Your MCP clients
        </div>
        <div className="space-y-2">
          {CLIENT_ORDER.map(({ id, emoji }) => {
            const c = clients.find((c) => c.id === id)
            const meta = stateMeta(c?.state ?? 'not_wired')
            const active = picked === id
            return (
              <button
                key={id}
                onClick={() => void pick(id)}
                className={`no-drag flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  active ? 'border-iris/50 bg-iris/10' : 'border-white/8 bg-black/20 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{emoji}</span>
                  <div>
                    <div className="text-sm font-medium text-ink">{c?.label ?? id}</div>
                    {c && c.state !== 'not_wired' && (
                      <div className="text-[11px] text-ink-faint">
                        {c.servers.filter((s) => s.present).map((s) => s.key).join(', ') || '—'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5" style={{ color: meta.color }}>
                  <meta.Icon className="h-4 w-4" />
                  <span className="text-xs font-medium">{meta.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      </GlassCard>

      {/* Snippet for the picked client */}
      {picked && (
        <GlassCard className="mb-5 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Copy className="h-4 w-4 text-violet" /> Copy-paste config
          </div>
          {snippetLoading || !snippet ? (
            <div className="flex items-center gap-2 text-sm text-ink-dim">
              <Spinner className="h-4 w-4" /> building snippet…
            </div>
          ) : (
            <>
              <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/8 bg-black/30 p-3 text-[11px] leading-relaxed text-ink-dim">
                {snippet.instructions}
              </pre>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-faint">FULL FILE (new file)</span>
                <Button variant="soft" onClick={() => void copy(snippet.fullFileJson, 'full file snippet')}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <pre className="mb-3 max-h-32 overflow-auto rounded-xl border border-white/8 bg-black/30 p-3 text-[11px] text-cyan">
                {snippet.fullFileJson}
              </pre>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-faint">MERGE (existing file)</span>
                <Button variant="soft" onClick={() => void copy(snippet.mergeJson, 'merge snippet')}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
              <pre className="mb-3 max-h-32 overflow-auto rounded-xl border border-white/8 bg-black/30 p-3 text-[11px] text-cyan">
                {snippet.mergeJson}
              </pre>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/5 px-3 py-2">
                <span className="truncate text-[11px] text-ink-faint">{snippet.filePath}</span>
                <Button variant="soft" onClick={() => void copy(snippet.filePath, 'file path')}>
                  <Copy className="h-3.5 w-3.5" /> Copy path
                </Button>
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
