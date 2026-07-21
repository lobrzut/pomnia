import clsx from 'clsx'
import { GripHorizontal, Pin, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppLogo } from '../components/AppLogo'
import { FlowDiagram } from '../components/FlowDiagram'
import { api } from '../lib/api'
import { formatFlowLiveBadge, uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

export default function FloatingMonitor() {
  const labels = uiLabels()
  const globalActivity = useStore((s) => s.globalActivity)
  const onboarded = useStore((s) => s.onboarded)
  const initGlobalActivity = useStore((s) => s.initGlobalActivity)
  const loadAppSettings = useStore((s) => s.loadAppSettings)
  const [pinned, setPinned] = useState(true)
  const [goArmed, setGoArmed] = useState(false)

  useEffect(() => {
    void loadAppSettings()
    const off = initGlobalActivity()
    return off
  }, [initGlobalActivity, loadAppSettings])

  useEffect(() => {
    void api.floatingMonitorGetAlwaysOnTop().then((r) => setPinned(r.alwaysOnTop))
    void api.handshakeGetArmed().then((r) => setGoArmed(r.armed))
    return api.onHandshakeArmed((e) => setGoArmed(e.armed))
  }, [])

  useEffect(() => {
    if (!onboarded) void api.floatingMonitorHide()
  }, [onboarded])

  const isIdle = globalActivity.kind === 'idle'
  const badge = isIdle ? labels.floatingMonitorIdleBadge : formatFlowLiveBadge(globalActivity)
  const pinLabel = pinned ? labels.floatingMonitorUnpin : labels.floatingMonitorPin

  return (
    <div
      className={clsx(
        'floating-pip-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl',
        isIdle ? 'floating-pip-shell--idle' : 'floating-pip-shell--live',
      )}
    >
      <div className="drag flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3 w-3 shrink-0 text-ink-faint/60" aria-hidden />
          <AppLogo size="xs" className="!h-5 !w-5" />
          {isIdle ? (
            <>
              <span className="shrink-0 text-[10px] font-bold tracking-[0.14em] text-grad">POMNIA</span>
              <span className="min-w-0 truncate text-[10px] font-medium text-ink-dim">{badge}</span>
            </>
          ) : (
            <>
              <span className="flow-live-dot h-1.5 w-1.5 shrink-0" aria-hidden />
              <span className="min-w-0 truncate text-[10px] font-semibold tracking-wide text-mint [text-shadow:0_0_12px_#34d399aa]">
                {badge}
              </span>
            </>
          )}
          {goArmed ? (
            <span className="shrink-0 rounded bg-mint/25 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mint">
              {labels.handshakeArmedBadge}
            </span>
          ) : null}
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
        className="no-drag flex min-h-0 flex-1 cursor-pointer flex-col outline-none"
        onClick={() => void api.floatingMonitorOpenMain()}
        onDoubleClick={() => void api.floatingMonitorHide()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void api.floatingMonitorOpenMain()
          }
        }}
        title={labels.floatingMonitorOpenHint}
      >
        <FlowDiagram variant="pip" className="min-h-0 flex-1 border-0 bg-transparent" />
      </div>
    </div>
  )
}
