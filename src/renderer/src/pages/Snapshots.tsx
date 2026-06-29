import { useState } from 'react'
import { FileArchive, MessageSquare, RotateCcw, ShieldCheck, Clock } from 'lucide-react'
import { Badge, Button, GlassCard, SourceTile, Spinner } from '../components/ui'
import { humanBytes, relativeTime, sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'

export default function Snapshots() {
  const { snapshots, vault, setRestoreTarget, toast } = useStore()
  const [verifying, setVerifying] = useState(false)

  async function verify() {
    setVerifying(true)
    try {
      const r = await api.verify()
      toast({
        kind: r.ok ? 'success' : 'error',
        title: r.ok ? 'Vault integrity OK' : `${r.errors.length} integrity error(s)`,
        detail: `${r.checked} encrypted blobs checked`
      })
    } finally {
      setVerifying(false)
    }
  }

  if (!vault.open)
    return <Empty title="No vault open" sub="Unlock or create a vault to see snapshots." />
  if (snapshots.length === 0)
    return <Empty title="Vault is empty" sub="Run a backup from the dashboard to create your first snapshot." />

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">Snapshots</h1>
          <p className="mt-1 text-sm text-ink-dim">{snapshots.length} sealed point-in-time captures.</p>
        </div>
        <Button variant="soft" onClick={verify} disabled={verifying}>
          {verifying ? <Spinner className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          Verify integrity
        </Button>
      </div>

      <div className="space-y-3">
        {snapshots.map((s, i) => {
          const meta = sourceMeta(s.source.id)
          return (
            <GlassCard key={s.id} delay={0.03 * i} className="flex items-center gap-4 p-4">
              <SourceTile glyph={meta.glyph} color={meta.color} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{s.source.label}</span>
                  <Badge color="#9aa3bd">
                    {s.origin.host} · {s.source.os}
                  </Badge>
                  {s.note && <span className="truncate text-xs italic text-ink-faint">“{s.note}”</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {relativeTime(s.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> {s.stats.conversations} chats
                  </span>
                  <span className="flex items-center gap-1">
                    <FileArchive className="h-3 w-3" /> {s.stats.files} files
                  </span>
                  <span>{humanBytes(s.stats.bytes)}</span>
                  <span className="font-mono text-[10px] text-ink-faint">{s.id.slice(0, 8)}</span>
                </div>
              </div>
              <Button variant="soft" onClick={() => setRestoreTarget(s)}>
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
            </GlassCard>
          )
        })}
      </div>
    </div>
  )
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl glass">
        <FileArchive className="h-7 w-7 text-ink-faint" />
      </div>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-dim">{sub}</p>
    </div>
  )
}
