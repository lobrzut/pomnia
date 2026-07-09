import { Map } from 'lucide-react'
import { GuideMap } from '../components/GuideMap'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

export default function HowItWorks() {
  const labels = uiLabels()
  const setRoute = useStore((s) => s.setRoute)

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
      <GuideMap onOpenTab={setRoute} />
    </div>
  )
}
