import { X } from 'lucide-react'
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

  const badge =
    globalActivity.kind === 'idle'
      ? labels.floatingMonitorIdleBadge
      : formatFlowLiveBadge(globalActivity)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="drag flex h-7 shrink-0 items-center justify-between gap-2 border-b border-white/8 px-2">
        <span className="min-w-0 truncate text-[10px] font-medium text-emerald/90">{badge}</span>
        <button
          type="button"
          className="no-drag rounded p-0.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
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
        <FlowDiagram variant="pip" className="min-h-0 flex-1 rounded-none border-0" />
      </div>
    </div>
  )
}
