import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Database, HardDriveDownload, MessageSquare, RefreshCw, Server, Layers } from 'lucide-react'
import { Badge, Button, GlassCard, Input, ProgressBar, SourceTile, Spinner } from '../components/ui'
import { humanBytes, sourceMeta } from '../lib/format'
import { useStore } from '../store/useStore'

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  delay
}: {
  icon: typeof Database
  label: string
  value: string | number
  sub?: string
  delay: number
}) {
  return (
    <GlassCard delay={delay} className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</span>
        <Icon className="h-4 w-4 text-iris" />
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-dim">{sub}</div>}
    </GlassCard>
  )
}

export default function Dashboard() {
  const { sources, scanning, scan, selected, toggleSelected, selectAll, backup, backingUp, backupPhase, vault } =
    useStore()
  const [note, setNote] = useState('')

  const installed = useMemo(() => sources.filter((s) => s.installed), [sources])
  const totals = useMemo(
    () => ({
      chats: installed.reduce((n, s) => n + (s.conversations ?? 0), 0),
      bytes: installed.reduce((n, s) => n + s.sizeBytes, 0)
    }),
    [installed]
  )
  const allSelected = installed.length > 0 && installed.every((s) => selected.has(s.id))

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">Command center</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Capture every assistant into one encrypted, searchable AI memory — backup is just the mechanism.
          </p>
        </div>
        <Button variant="soft" onClick={() => scan()} disabled={scanning}>
          {scanning ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          Rescan
        </Button>
      </div>

      <div className="mb-7 grid grid-cols-4 gap-4">
        <Stat icon={Server} label="Sources" value={installed.length} sub="installed" delay={0.02} />
        <Stat icon={MessageSquare} label="Chats found" value={totals.chats || '—'} sub="extractable" delay={0.06} />
        <Stat icon={Layers} label="Snapshots" value={vault.snapshots} sub={vault.open ? vault.name : 'no vault'} delay={0.1} />
        <Stat icon={HardDriveDownload} label="Payload" value={humanBytes(totals.bytes)} sub="after cache trim" delay={0.14} />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Sources</h2>
        <button
          onClick={() =>
            selectAll(allSelected ? [] : installed.map((s) => s.id))
          }
          className="text-xs font-medium text-iris hover:text-cyan"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {scanning && installed.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-[104px] rounded-[var(--radius-xl)]" />
          ))
        ) : installed.length === 0 ? (
          <div className="col-span-2 flex flex-col items-center gap-2 rounded-[var(--radius-xl)] border border-dashed border-white/10 px-6 py-10 text-center">
            <Server className="h-6 w-6 text-ink-faint" />
            <p className="text-sm text-ink-dim">No AI tools detected on this machine.</p>
            <p className="max-w-sm text-[11px] leading-relaxed text-ink-faint">
              Reliqua looks for Claude Code, Cursor, Claude Desktop, Antigravity and VS Code. Install one, chat a bit,
              then hit Rescan — or bring exported chats in via the Import tab.
            </p>
          </div>
        ) : (
          installed.map((s, i) => {
              const meta = sourceMeta(s.id)
              const on = selected.has(s.id)
              return (
                <GlassCard
                  key={s.id}
                  delay={0.04 * i}
                  hover
                  onClick={() => toggleSelected(s.id)}
                  className="relative overflow-hidden p-4"
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[var(--radius-xl)] transition-opacity"
                    style={{
                      opacity: on ? 1 : 0,
                      boxShadow: `inset 0 0 0 1.5px ${meta.color}aa, inset 0 0 60px -30px ${meta.color}`
                    }}
                  />
                  <div className="relative flex items-start gap-3.5">
                    <SourceTile glyph={meta.glyph} color={meta.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-ink">{s.label}</span>
                        <Badge color={s.strategy === 'hybrid' ? '#34d399' : '#9aa3bd'}>{s.strategy}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-dim">
                        <span>{humanBytes(s.sizeBytes)}</span>
                        {s.conversations != null && <span>{s.conversations} chats</span>}
                      </div>
                      {s.notes?.[0] && <div className="mt-1.5 truncate text-[11px] text-ink-faint">{s.notes[0]}</div>}
                    </div>
                    <motion.div
                      animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ background: meta.color }}
                    >
                      <Check className="h-3.5 w-3.5 text-black" strokeWidth={3} />
                    </motion.div>
                  </div>
                </GlassCard>
              )
            })
        )}
      </div>

      {/* Backup launch bar */}
      <motion.div layout className="sticky bottom-0 mt-7">
        <GlassCard className="flex items-center gap-4 p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            {backingUp ? (
              <>
                <div className="mb-1.5 text-sm font-medium text-ink">{backupPhase || 'Working…'}</div>
                <ProgressBar indeterminate />
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-ink">
                  {selected.size} source{selected.size === 1 ? '' : 's'} selected
                </div>
                <div className="text-xs text-ink-dim">
                  {vault.open ? `Sealing into "${vault.name}"` : 'Open a vault to enable backup'}
                </div>
              </>
            )}
          </div>
          <div className="hidden w-56 shrink-0 md:block">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional note…" />
          </div>
          <Button onClick={() => backup(note)} disabled={backingUp || !vault.open || selected.size === 0}>
            {backingUp ? <Spinner className="h-4 w-4" /> : <HardDriveDownload className="h-4 w-4" />}
            Backup now
          </Button>
        </GlassCard>
      </motion.div>
    </div>
  )
}
