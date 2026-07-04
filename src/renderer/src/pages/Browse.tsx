import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { MessagesSquare, Search } from 'lucide-react'
import { GlassCard, Input, SourceTile, Spinner } from '../components/ui'
import { relativeTime, sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import type { Conversation, ConversationMeta, SourceId, TextHit } from '../lib/types'
import { useStore } from '../store/useStore'

export default function Browse() {
  const { vault } = useStore()
  const [list, setList] = useState<ConversationMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<TextHit[] | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceId | 'all'>('all')
  const [open, setOpen] = useState<{ meta: { snapshotId: string; id: string }; conv: Conversation | null } | null>(null)
  const [loadingConv, setLoadingConv] = useState(false)

  useEffect(() => {
    if (!vault.open) return
    setLoading(true)
    api
      .vaultConversations()
      .then(setList)
      .finally(() => setLoading(false))
  }, [vault.open])

  // Content search (substring across all messages) when query present.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    const t = setTimeout(() => void api.vaultSearchText(q).then(setHits), 280)
    return () => clearTimeout(t)
  }, [query])

  const sources = useMemo(() => Array.from(new Set(list.map((c) => c.source))), [list])
  const filtered = useMemo(
    () => list.filter((c) => sourceFilter === 'all' || c.source === sourceFilter),
    [list, sourceFilter]
  )

  async function openConv(snapshotId: string, id: string) {
    setOpen({ meta: { snapshotId, id }, conv: null })
    setLoadingConv(true)
    try {
      setOpen({ meta: { snapshotId, id }, conv: await api.vaultConversation(snapshotId, id) })
    } finally {
      setLoadingConv(false)
    }
  }

  if (!vault.open)
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl glass">
          <MessagesSquare className="h-7 w-7 text-ink-faint" />
        </div>
        <h2 className="text-lg font-semibold text-ink">No vault open</h2>
        <p className="mt-1 text-sm text-ink-dim">Unlock a vault to browse and search your aggregated chats.</p>
      </div>
    )

  const showingHits = hits !== null

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <h1 className="text-[26px] font-bold tracking-tight text-grad">Chats</h1>
        <p className="mt-1 text-sm text-ink-dim">
          {loading
            ? 'Loading conversations from your vault…'
            : list.length === 0
              ? 'No conversations in this vault yet — import some from the Import tab.'
              : `${list.length} conversations aggregated from every source — searched locally, no GPU.`}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search across all chat content…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {['all', ...sources].map((s) => {
            const active = sourceFilter === s
            const label = s === 'all' ? 'All' : sourceMeta(s).label
            return (
              <button
                key={s}
                onClick={() => setSourceFilter(s as SourceId | 'all')}
                className={`no-drag rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-white/14 text-ink border border-white/15' : 'text-ink-faint hover:text-ink-dim'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4">
        {/* List / hits */}
        <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-ink-dim">
              <Spinner className="h-4 w-4" /> loading…
            </div>
          ) : showingHits ? (
            hits!.length === 0 ? (
              <p className="p-4 text-sm text-ink-faint">No content matches.</p>
            ) : (
              hits!.map((h) => {
                const m = sourceMeta(h.source)
                return (
                  <button
                    key={h.id}
                    onClick={() => openConv(h.snapshotId, h.id)}
                    className="no-drag block w-full rounded-xl border border-white/8 bg-white/4 p-3 text-left transition-colors hover:bg-white/8"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span style={{ color: m.color }}>{m.label}</span>
                      {h.matches > 0 && <span className="text-ink-faint">· {h.matches} hits</span>}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium text-ink">{h.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-ink-dim">{h.snippet}</div>
                  </button>
                )
              })
            )
          ) : (
            filtered.map((c) => {
              const m = sourceMeta(c.source)
              const sel = open?.meta.id === c.id
              return (
                <button
                  key={c.id + c.snapshotId}
                  onClick={() => openConv(c.snapshotId, c.id)}
                  className={`no-drag flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    sel ? 'border-iris/40 bg-iris/10' : 'border-white/8 bg-white/4 hover:bg-white/8'
                  }`}
                >
                  <SourceTile glyph={m.glyph} color={m.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{c.title}</div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-faint">
                      <span style={{ color: m.color }}>{m.label}</span>
                      <span>· {c.messages} msgs</span>
                      <span>· {relativeTime(c.updatedAt)}</span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Reader */}
        <GlassCard className="max-h-[64vh] overflow-hidden p-0">
          {!open ? (
            <div className="flex h-full min-h-[40vh] items-center justify-center p-6 text-center text-sm text-ink-faint">
              Select a conversation to read it.
            </div>
          ) : loadingConv || !open.conv ? (
            <div className="flex h-full items-center justify-center p-6">
              <Spinner className="h-5 w-5 text-ink-dim" />
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b border-white/8 p-4">
                <div className="truncate font-semibold text-ink">{open.conv.title}</div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {sourceMeta(open.conv.source).label} · {open.conv.messages.length} messages
                  {open.conv.project ? ` · ${open.conv.project}` : ''}
                </div>
              </div>
              <div className="space-y-3 overflow-y-auto p-4">
                {open.conv.messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                    className={`rounded-xl p-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-iris/12 text-ink'
                        : msg.role === 'assistant'
                          ? 'bg-white/5 text-ink-dim'
                          : 'bg-black/20 text-ink-faint'
                    }`}
                  >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{msg.role}</div>
                    <div className="whitespace-pre-wrap break-words">{msg.text.slice(0, 4000)}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
