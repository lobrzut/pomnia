import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { BrainCircuit, Clock, Database, FileText, Sparkles } from 'lucide-react'
import { GlassCard, Spinner } from './ui'
import { api } from '../lib/api'
import { shortPath, relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { useStore, type Route } from '../store/useStore'
import type { BrainStateInfo, BrainStatus, EmbeddedBrainStatus } from '../lib/types'

interface StripItem {
  id: string
  icon: typeof Database
  label: string
  value: string
  detail?: string
  ok: boolean | null
  tab: Route
}

export function StatusStrip() {
  const labels = uiLabels()
  const { vault, setRoute, ollamaUrl, loadBrainState, brainState } = useStore()
  const [checking, setChecking] = useState(true)
  const [ollama, setOllama] = useState<BrainStatus | null>(null)
  const [core, setCore] = useState<EmbeddedBrainStatus | null>(null)
  const [localBrainState, setLocalBrainState] = useState<BrainStateInfo | null>(brainState)

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const [status, coreStatus, state] = await Promise.all([
        api.brainStatus(ollamaUrl || undefined).catch(() => null),
        api.brainCoreStatus().catch(() => null),
        api.brainState().catch(() => null)
      ])
      setOllama(status)
      setCore(coreStatus)
      setLocalBrainState(state)
    } finally {
      setChecking(false)
    }
  }, [ollamaUrl])

  useEffect(() => {
    void refresh()
    void loadBrainState()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh, loadBrainState])

  const pendingDocs = vault.pendingLibraryIndex ?? 0
  const lastDistill = localBrainState?.lastRun
    ? relativeTime(localBrainState.lastRun)
    : labels.statusNoDistill

  const items: StripItem[] = [
    {
      id: 'vault',
      icon: Database,
      label: labels.statusVault,
      value: vault.open ? labels.statusVaultOpen : labels.statusVaultClosed,
      detail: vault.open ? shortPath(vault.path ?? vault.name ?? '') : undefined,
      ok: vault.open,
      tab: 'settings'
    },
    {
      id: 'brain',
      icon: BrainCircuit,
      label: labels.statusBrain,
      value: core?.running ? labels.statusBrainRunning : labels.statusBrainStopped,
      ok: core?.running ?? false,
      tab: 'brain'
    },
    {
      id: 'ollama',
      icon: Sparkles,
      label: labels.statusOllama,
      value: ollama?.reachable ? labels.statusOllamaOk : labels.statusOllamaFail,
      detail: ollama?.baseUrl ? shortPath(ollama.baseUrl, 28) : undefined,
      ok: ollama?.reachable ?? false,
      tab: 'brain'
    },
    {
      id: 'distill',
      icon: Clock,
      label: labels.statusLastDistill,
      value: lastDistill,
      ok: localBrainState?.lastRun ? true : null,
      tab: 'brain'
    },
    {
      id: 'docs',
      icon: FileText,
      label: 'Dokumenty',
      value: pendingDocs > 0 ? labels.statusPendingDocs(pendingDocs) : labels.statusPendingDocsNone,
      ok: pendingDocs === 0 ? true : null,
      tab: pendingDocs > 0 ? 'brain' : 'import'
    }
  ]

  return (
    <GlassCard className="mb-5 p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {labels.statusStripTitle}
        </span>
        {checking && <Spinner className="h-3 w-3 text-ink-faint" />}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.tab)}
              className="no-drag flex min-w-[140px] flex-1 items-start gap-2 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-left transition-colors hover:border-white/12 hover:bg-white/6"
            >
              <span
                className={clsx(
                  'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  item.ok === true && 'bg-mint',
                  item.ok === false && 'bg-rose',
                  item.ok === null && 'bg-amber'
                )}
                style={item.ok === true ? { boxShadow: '0 0 8px #34d39988' } : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{item.label}</span>
                </div>
                <div className="truncate text-xs font-semibold text-ink">{item.value}</div>
                {item.detail && <div className="truncate text-[10px] text-ink-faint">{item.detail}</div>}
              </div>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
