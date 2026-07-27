// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
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

/** Survives Dashboard remounts so tab switches don't flash false reds. */
let stripCache: {
  ollama: BrainStatus | null
  core: EmbeddedBrainStatus | null
  state: BrainStateInfo | null
} | null = null

export function StatusStrip() {
  const labels = uiLabels()
  const { vault, setRoute, ollamaUrl, loadBrainState, brainState } = useStore()
  const [checking, setChecking] = useState(() => stripCache === null)
  const [ollama, setOllama] = useState<BrainStatus | null>(() => stripCache?.ollama ?? null)
  const [core, setCore] = useState<EmbeddedBrainStatus | null>(() => stripCache?.core ?? null)
  const [localBrainState, setLocalBrainState] = useState<BrainStateInfo | null>(
    () => stripCache?.state ?? brainState
  )

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
      stripCache = { ollama: status, core: coreStatus, state }
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
  const distillPending = checking && localBrainState === null && !brainState?.lastRun
  const lastDistill = distillPending
    ? labels.statusChecking
    : localBrainState?.lastRun || brainState?.lastRun
      ? relativeTime(localBrainState?.lastRun ?? brainState?.lastRun ?? '')
      : labels.statusNoDistill

  const brainPending = checking && core === null
  const ollamaPending = checking && ollama === null

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
      value: brainPending
        ? labels.statusChecking
        : core?.running
          ? labels.statusBrainRunning
          : labels.statusBrainStopped,
      ok: brainPending ? null : (core?.running ?? false),
      tab: 'brain'
    },
    {
      id: 'ollama',
      icon: Sparkles,
      label: labels.statusOllama,
      value: ollamaPending
        ? labels.statusChecking
        : ollama?.reachable
          ? labels.statusOllamaOk
          : labels.statusOllamaFail,
      detail: ollamaPending ? undefined : ollama?.baseUrl ? shortPath(ollama.baseUrl, 28) : undefined,
      ok: ollamaPending ? null : (ollama?.reachable ?? false),
      tab: 'brain'
    },
    {
      id: 'distill',
      icon: Clock,
      label: labels.statusLastDistill,
      value: lastDistill,
      ok: distillPending ? null : localBrainState?.lastRun || brainState?.lastRun ? true : null,
      tab: 'brain'
    },
    {
      id: 'docs',
      icon: FileText,
      label: labels.statusDocuments,
      value: pendingDocs > 0 ? labels.statusPendingDocs(pendingDocs) : labels.statusPendingDocsNone,
      ok: pendingDocs === 0 ? true : null,
      tab: pendingDocs > 0 ? 'brain' : 'import'
    }
  ]

  return (
    <GlassCard className="mb-2 shrink-0 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {labels.statusStripTitle}
        </span>
        {checking && <Spinner className="h-3 w-3 text-ink-faint" />}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setRoute(item.tab)}
              className="no-drag flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-white/6 bg-black/20 px-2.5 py-1.5 text-left transition-colors hover:border-white/12 hover:bg-white/6"
            >
              <span
                className={clsx(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  item.ok === true && 'bg-mint',
                  item.ok === false && 'bg-rose',
                  item.ok === null && 'bg-amber'
                )}
                style={item.ok === true ? { boxShadow: '0 0 8px #34d39988' } : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <Icon className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="truncate text-[9px] font-medium uppercase tracking-wider text-ink-faint">
                    {item.label}
                  </span>
                </div>
                <div className="truncate text-[11px] font-semibold leading-tight text-ink">
                  {item.value}
                  {item.detail ? (
                    <span className="ml-1 font-normal text-ink-faint">{item.detail}</span>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </GlassCard>
  )
}
