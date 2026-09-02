// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import clsx from 'clsx'
import { GripHorizontal, Pin, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppLogo } from '../components/AppLogo'
import { FlowDiagram } from '../components/FlowDiagram'
import { api } from '../lib/api'
import { formatFlowLiveBadge, uiLabels } from '../lib/labels'
import type { EmbeddedBrainStatus } from '../lib/types'
import { useStore } from '../store/useStore'
import { isMini } from '../lib/flavour'

function brainIdleBadge(
  labels: ReturnType<typeof uiLabels>,
  core: EmbeddedBrainStatus | null,
): string {
  if (!core) return labels.floatingMonitorIdleBadge
  if (core.starting) return labels.floatingMonitorBrainStarting
  if (core.running) return labels.floatingMonitorBrainReady
  if (core.lastError) return labels.floatingMonitorBrainError
  return labels.floatingMonitorBrainOff
}

export default function FloatingMonitor() {
  const labels = uiLabels()
  const globalActivity = useStore((s) => s.globalActivity)
  const onboarded = useStore((s) => s.onboarded)
  const initGlobalActivity = useStore((s) => s.initGlobalActivity)
  const loadAppSettings = useStore((s) => s.loadAppSettings)
  const [pinned, setPinned] = useState(true)
  const [core, setCore] = useState<EmbeddedBrainStatus | null>(null)

  useEffect(() => {
    void loadAppSettings()
    const off = initGlobalActivity()
    return off
  }, [initGlobalActivity, loadAppSettings])

  useEffect(() => {
    void api.floatingMonitorGetAlwaysOnTop().then((r) => setPinned(r.alwaysOnTop))
  }, [])

  useEffect(() => {
    // Mini runs no brain of its own, so there is no local status to poll
    // and reporting one would only ever say 'stopped' about a component
    // that was never meant to exist here.
    if (isMini) return
    let cancelled = false
    const refresh = () => {
      void api.brainCoreStatus().then((s) => {
        if (!cancelled) setCore(s)
      }).catch(() => {
        if (!cancelled) setCore(null)
      })
    }
    refresh()
    const id = setInterval(refresh, 4_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    // Mini has no onboarding to complete, so `onboarded` is false forever
    // and this hid the window the instant the tray opened it — a checkbox
    // that ticks and does nothing.
    if (!isMini && !onboarded) void api.floatingMonitorHide()
  }, [onboarded])

  const isIdle = globalActivity.kind === 'idle'
  // In Mini the idle badge speaks only for the memory, not for a local
  // engine: `core` stays null there, which is the neutral 'waiting' text.
  const badge = isIdle ? brainIdleBadge(labels, core) : formatFlowLiveBadge(globalActivity)
  const pinLabel = pinned ? labels.floatingMonitorUnpin : labels.floatingMonitorPin
  const brainLive = !!(core?.running || core?.starting)
  const brainError = !!(core && !core.running && !core.starting && core.lastError)

  return (
    <div
      className={clsx(
        'floating-pip-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl',
        isIdle ? 'floating-pip-shell--idle' : 'floating-pip-shell--live',
        brainError && isIdle && 'floating-pip-shell--error',
      )}
    >
      <div className="drag flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3 w-3 shrink-0 text-ink-faint/60" aria-hidden />
          <AppLogo size="xs" className="!h-5 !w-5" />
          {isIdle ? (
            <>
              <span className="shrink-0 text-[10px] font-bold tracking-[0.14em] text-grad">POMNIA</span>
              <span
                className={clsx(
                  'min-w-0 truncate text-[10px] font-medium',
                  brainError
                    ? 'text-amber'
                    : brainLive
                      ? 'text-mint'
                      : 'text-ink-dim',
                )}
                title={core?.lastError ?? badge}
              >
                {badge}
              </span>
            </>
          ) : (
            <>
              <span className="flow-live-dot h-1.5 w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate text-[10px] font-semibold tracking-wide text-mint [text-shadow:0_0_12px_#34d399aa]">
                {badge}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className={clsx(
              'no-drag rounded-md p-0.5 transition-colors hover:bg-white/10',
              pinned ? 'text-mint hover:text-mint' : 'text-ink-faint hover:text-ink',
            )}
            onClick={() => {
              const next = !pinned
              setPinned(next)
              void api.floatingMonitorSetAlwaysOnTop(next).then((r) => setPinned(r.alwaysOnTop))
            }}
            aria-label={pinLabel}
            aria-pressed={pinned}
            title={pinLabel}
          >
            <Pin className={clsx('h-3.5 w-3.5', pinned && 'fill-current')} />
          </button>
          <button
            type="button"
            className="no-drag rounded-md p-0.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
            onClick={() => void api.floatingMonitorHide()}
            aria-label={labels.floatingMonitorClose}
            title={labels.floatingMonitorClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        className="no-drag flex min-h-0 flex-1 cursor-pointer flex-col px-1.5 pb-1.5 pt-1"
        title={labels.floatingMonitorOpenHint}
        onClick={() => void api.floatingMonitorOpenMain()}
        onDoubleClick={(e) => {
          e.preventDefault()
          void api.floatingMonitorHide()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void api.floatingMonitorOpenMain()
          }
        }}
      >
        {/* Must be variant="pip" — default "full" overflows 300×118 and shows only bottom icon row. */}
        <FlowDiagram variant="pip" />
      </div>
    </div>
  )
}
