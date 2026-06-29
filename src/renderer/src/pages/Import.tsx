import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, FileUp, Import as ImportIcon, Upload } from 'lucide-react'
import { Badge, Button, GlassCard, SourceTile, Spinner } from '../components/ui'
import { sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'

const PROVIDERS: { id: string; how: string }[] = [
  { id: 'claude-ai', how: 'Settings → Privacy → Export data → conversations.json (ZIP)' },
  { id: 'chatgpt', how: 'Settings → Data controls → Export data → conversations.json (ZIP)' },
  { id: 'gemini', how: 'Google Takeout → Gemini Apps activity → JSON' },
  { id: 'grok', how: 'Account → export conversations → ZIP/JSON' }
]

export default function Import() {
  const { vault, refreshVault, toast } = useStore()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ sealed: number; sources: { source: string; count: number }[] } | null>(null)

  async function pickAndImport() {
    setBusy(true)
    setResult(null)
    try {
      const file = await api.pickFile()
      if (!file) return
      const r = await api.importToVault(file)
      setResult(r)
      if (r.sealed > 0) {
        await refreshVault()
        toast({
          kind: 'success',
          title: `Imported ${r.sealed} conversations`,
          detail: r.sources.map((s) => `${sourceMeta(s.source).label}: ${s.count}`).join(' · ')
        })
      } else {
        toast({ kind: 'warn', title: 'Nothing recognized in that file' })
      }
    } catch (e) {
      toast({ kind: 'error', title: 'Import failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <ImportIcon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">Import</h1>
          <p className="text-sm text-ink-dim">
            Pull chats you exported from Claude.ai, ChatGPT, Gemini or Grok into your vault.
          </p>
        </div>
      </div>

      {/* Drop / pick zone */}
      <GlassCard
        hover
        onClick={vault.open && !busy ? pickAndImport : undefined}
        className="mb-5 flex flex-col items-center justify-center gap-3 border-dashed p-10 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6">
          {busy ? <Spinner className="h-6 w-6 text-iris" /> : <FileUp className="h-6 w-6 text-iris" />}
        </div>
        <div className="text-sm font-semibold text-ink">
          {busy ? 'Importing…' : vault.open ? 'Choose an export file' : 'Open a vault first'}
        </div>
        <div className="text-xs text-ink-faint">ZIP · JSON · JSONL · MD — auto-detects the source</div>
        {vault.open && (
          <Button onClick={pickAndImport} disabled={busy} className="mt-1">
            <Upload className="h-4 w-4" /> Select export…
          </Button>
        )}
      </GlassCard>

      {result && result.sealed > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="mb-5 flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-mint" />
            <div className="flex-1 text-sm text-ink">
              Sealed <span className="font-semibold">{result.sealed}</span> conversations into the vault — now in{' '}
              <span className="text-iris">Chats</span> &amp; restorable.
            </div>
            <div className="flex gap-1.5">
              {result.sources.map((s) => (
                <Badge key={s.source} color={sourceMeta(s.source).color}>
                  {sourceMeta(s.source).label} {s.count}
                </Badge>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Where to get exports */}
      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">Where to export from</div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => {
          const m = sourceMeta(p.id)
          return (
            <GlassCard key={p.id} className="flex items-start gap-3 p-4">
              <SourceTile glyph={m.glyph} color={m.color} size={38} />
              <div className="min-w-0">
                <div className="font-semibold text-ink">{m.label}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{p.how}</div>
              </div>
            </GlassCard>
          )
        })}
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">
        Reliqua imports official exports only — no scraping or logging into accounts (fragile + against terms).
        Claude Desktop / Gemini chats live server-side, so you export them from the web, then import here.
      </p>
    </div>
  )
}
