import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, FolderInput, MonitorSmartphone, RotateCcw, ShieldQuestion } from 'lucide-react'
import { Badge, Button, GlassCard, SourceTile, Spinner } from '../components/ui'
import { humanBytes, sourceMeta } from '../lib/format'
import { api } from '../lib/api'
import type { RestorePlan } from '../lib/types'
import { useStore } from '../store/useStore'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="no-drag flex items-center gap-2.5 text-sm text-ink-dim">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'accent-grad' : 'bg-white/12'}`}>
        <motion.span layout className="absolute top-0.5 h-4 w-4 rounded-full bg-white" style={{ left: on ? 18 : 2 }} />
      </span>
      {label}
    </button>
  )
}

export default function Restore() {
  const { restoreTarget, snapshots, setRestoreTarget, toast, refreshVault } = useStore()
  const [overwrite, setOverwrite] = useState(false)
  const [remap, setRemap] = useState(true)
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!restoreTarget) return
    setLoading(true)
    api
      .restorePlan(restoreTarget.id, { overwrite, remapPaths: remap })
      .then(setPlan)
      .finally(() => setLoading(false))
  }, [restoreTarget, overwrite, remap])

  if (!restoreTarget)
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-[26px] font-bold tracking-tight text-grad">Restore</h1>
        <p className="mb-6 text-sm text-ink-dim">Pick a snapshot to project back onto this machine.</p>
        {snapshots.length === 0 ? (
          <p className="mt-20 text-center text-sm text-ink-faint">No snapshots in the open vault.</p>
        ) : (
          <div className="space-y-2.5">
            {snapshots.map((s) => {
              const m = sourceMeta(s.source.id)
              return (
                <GlassCard key={s.id} hover className="flex items-center gap-3 p-3.5" >
                  <button className="no-drag absolute inset-0" onClick={() => setRestoreTarget(s)} />
                  <SourceTile glyph={m.glyph} color={m.color} />
                  <div className="flex-1">
                    <div className="font-medium text-ink">{s.source.label}</div>
                    <div className="text-xs text-ink-dim">
                      {s.stats.files} files · {humanBytes(s.stats.bytes)} · from {s.source.os}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-ink-faint" />
                </GlassCard>
              )
            })}
          </div>
        )}
      </div>
    )

  const meta = sourceMeta(restoreTarget.source.id)
  const targetOS = api.platform === 'browser' ? 'darwin' : api.platform
  const crossOS = restoreTarget.source.os !== targetOS
  const counts =
    plan?.entries.reduce<Record<string, number>>((a, e) => ((a[e.action] = (a[e.action] || 0) + 1), a), {}) ?? {}

  async function run() {
    setRunning(true)
    try {
      const res = await api.restore(restoreTarget!.id, { overwrite, remapPaths: remap })
      toast({
        kind: res.failed ? 'warn' : 'success',
        title: `Restored ${res.written} files`,
        detail:
          (res.failed ? `${res.failed} locked (close the app) · ` : '') +
          `${res.remapped} path-remapped → ${res.targetRoot}`
      })
      await refreshVault()
      setRestoreTarget(null)
    } catch (e) {
      toast({ kind: 'error', title: 'Restore failed', detail: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={() => setRestoreTarget(null)} className="mb-4 text-xs text-ink-faint hover:text-ink">
        ← back to snapshots
      </button>

      <GlassCard className="mb-5 p-6">
        <div className="flex items-center gap-4">
          <SourceTile glyph={meta.glyph} color={meta.color} size={52} />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink">{restoreTarget.source.label}</h1>
            <p className="text-xs text-ink-dim">
              {restoreTarget.stats.files} files · {humanBytes(restoreTarget.stats.bytes)} · captured on{' '}
              {restoreTarget.origin.host}
            </p>
          </div>
        </div>

        {/* OS journey */}
        <div className="mt-5 flex items-center justify-center gap-4 rounded-2xl bg-black/20 py-4">
          <OsChip os={restoreTarget.source.os} label="origin" />
          <motion.div animate={{ x: [0, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
            <ArrowRight className="h-5 w-5 text-iris" />
          </motion.div>
          <OsChip os={targetOS} label="this machine" />
          {crossOS && (
            <Badge color="#fbbf24">
              <MonitorSmartphone className="h-3 w-3" /> cross-platform
            </Badge>
          )}
        </div>
      </GlassCard>

      <GlassCard className="mb-5 p-5">
        <div className="mb-4 flex items-center gap-6">
          <Toggle on={remap} onChange={setRemap} label="Remap paths for this OS" />
          <Toggle on={overwrite} onChange={setOverwrite} label="Overwrite live data" />
        </div>

        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${
            overwrite ? 'border-rose/25 bg-rose/10 text-rose' : 'border-cyan/20 bg-cyan/10 text-cyan'
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {overwrite ? (
            <span>
              Writes straight into <b>{restoreTarget.source.label}</b>'s live folder so the app picks it up.
              <b> Close {restoreTarget.source.label} first</b> — open files are locked and get skipped.
            </span>
          ) : (
            <span>
              Safe mode: files go to a side-by-side <b>“… (reliqua-restore)”</b> folder — so{' '}
              <b>{restoreTarget.source.label} won't see them.</b> To actually load them into the app, turn on{' '}
              <b>Overwrite live data</b> and close the app first.
            </span>
          )}
        </div>

        {loading || !plan ? (
          <div className="flex items-center gap-2 text-sm text-ink-dim">
            <Spinner className="h-4 w-4" /> computing plan…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-ink">
              <FolderInput className="h-4 w-4 text-iris" />
              <span className="font-mono text-xs text-ink-dim">{plan.targetRoot}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge color="#34d399">{counts.create ?? 0} new</Badge>
              {!!counts.overwrite && <Badge color="#fb7185">{counts.overwrite} overwrite</Badge>}
              {!!counts.remap && <Badge color="#22d3ee">{counts.remap} remapped</Badge>}
              {!!counts['skip-exists'] && <Badge color="#9aa3bd">{counts['skip-exists']} skipped</Badge>}
              <Badge color="#9aa3bd">{humanBytes(plan.totalBytes)}</Badge>
            </div>
            {plan.warnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {plan.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-amber/20 bg-amber/10 p-2.5 text-xs text-amber">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </GlassCard>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          <ShieldQuestion className="h-3.5 w-3.5" />
          {overwrite ? 'Files will be written over live data.' : 'Safe mode: restores into a side-by-side folder.'}
        </p>
        <Button onClick={run} disabled={running || loading}>
          {running ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          Restore {restoreTarget.source.label}
        </Button>
      </div>
    </div>
  )
}

function OsChip({ os, label }: { os: string; label: string }) {
  const names: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }
  return (
    <div className="text-center">
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-ink">
        {names[os] ?? os}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
    </div>
  )
}
