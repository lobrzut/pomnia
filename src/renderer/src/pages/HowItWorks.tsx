import { useState } from 'react'
import { Map, RotateCcw } from 'lucide-react'
import { FlowDiagram } from '../components/FlowDiagram'
import { Button, GlassCard } from '../components/ui'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

export default function HowItWorks() {
  const labels = uiLabels()
  const setRoute = useStore((s) => s.setRoute)
  const [animKey, setAnimKey] = useState(0)

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
        <div className="mb-3 flex items-center justify-end">
          <Button variant="soft" onClick={() => setAnimKey((k) => k + 1)}>
            <RotateCcw className="h-3.5 w-3.5" />
            {labels.guideFlowReplay}
          </Button>
        </div>
        <FlowDiagram variant="full" animKey={animKey} onNavigate={setRoute} />
      </GlassCard>
    </div>
  )
}
