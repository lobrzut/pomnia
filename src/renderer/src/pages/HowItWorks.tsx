import { useCallback, useEffect, useState } from 'react'
import { History, Map, RotateCcw } from 'lucide-react'
import { FlowDiagram } from '../components/FlowDiagram'
import { Button, GlassCard } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'
import type { LastActivityReplay } from '../lib/types'

export default function HowItWorks() {
  const labels = uiLabels()
  const setRoute = useStore((s) => s.setRoute)
  const globalActivity = useStore((s) => s.globalActivity)
  const toast = useStore((s) => s.toast)
  const [animKey, setAnimKey] = useState(0)
  const [replayKey, setReplayKey] = useState(0)
  const [lastReplay, setLastReplay] = useState<LastActivityReplay | null>(null)

  useEffect(() => {
    void api.mcpActivityWatch(true)
    return () => {
      void api.mcpActivityWatch(false)
    }
  }, [])

  useEffect(() => {
    if (globalActivity.kind !== 'idle') return
    void api.activityLastReplay().then(setLastReplay).catch(() => setLastReplay(null))
  }, [globalActivity.kind])

  const replayLastActivity = useCallback(async () => {
    if (globalActivity.kind !== 'idle') {
      toast({ kind: 'info', title: labels.guideFlowReplayLastBusy })
      return
    }
    const snapshot = await api.activityLastReplay().catch(() => null)
    if (!snapshot?.steps?.length) {
      toast({ kind: 'info', title: labels.guideFlowReplayLastNone })
      return
    }
    setLastReplay(snapshot)
    setReplayKey((k) => k + 1)
  }, [globalActivity.kind, labels, toast])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <Map className="h-5 w-5 text-iris" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-iris">{labels.guideSubtitle}</p>
        </div>
        <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.guideTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-dim">{labels.guideLead}</p>
      </div>

      <GlassCard className="overflow-hidden p-4">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[10px] italic text-ink-faint sm:mr-0">{labels.guideFlowReplayHint}</span>
          <Button variant="soft" onClick={() => setAnimKey((k) => k + 1)}>
            <RotateCcw className="h-3.5 w-3.5" />
            {labels.guideFlowReplay}
          </Button>
          <Button variant="soft" onClick={() => void replayLastActivity()}>
            <History className="h-3.5 w-3.5" />
            {labels.guideFlowReplayLast}
          </Button>
        </div>
        <FlowDiagram
          variant="full"
          animKey={animKey}
          replayKey={replayKey}
          replaySnapshot={lastReplay}
          onNavigate={setRoute}
        />
      </GlassCard>
    </div>
  )
}
