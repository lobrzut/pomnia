import clsx from 'clsx'
import { GripHorizontal, X } from 'lucide-react'
import { useEffect } from 'react'
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

  useEffect(() => {
    void loadAppSettings()
    const off = initGlobalActivity()
    return off
  }, [initGlobalActivity, loadAppSettings])

  useEffect(() => {
    if (!onboarded) void api.floatingMonitorHide()
  }, [onboarded])

  const isIdle = globalActivity.kind === 'idle'
  const badge = isIdle ? labels.floatingMonitorIdleBadge : formatFlowLiveBadge(globalActivity)

  return (
    <div className="floating-pip-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <div className="drag flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/8 px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3 w-3 shrink-0 text-ink-faint/70" aria-hidden />
          {!isIdle && <span className="flow-live-dot h-1.5 w-1.5 shrink-0" aria-hidden />}
          <span
            className={clsx(
              'min-w-0 truncate text-[10px] font-medium tracking-wide',
              isIdle ? 'text-ink-dim' : 'text-mint',
            )}
          >
            {badge}
          </span>
        </div>
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

      <div
        role="button"
        tabIndex={0}
        className="no-drag flex min-h-0 flex-1 cursor-pointer flex-col outline-none transition-opacity hover:opacity-[0.98]"
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
