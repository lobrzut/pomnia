// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { FileText, Layers, Loader2, Plug, Rocket, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button, ProgressBar } from './ui'
import { uiLabels } from '../lib/labels'
import type { ActivityKind, ActivityState } from '../lib/types'
import { useStore } from '../store/useStore'

const ICONS: Record<Exclude<ActivityKind, 'idle'>, LucideIcon> = {
  distill: Sparkles,
  'doc-import': FileText,
  'brain-start': Rocket,
  indexing: Layers,
  embed: Loader2,
  'mcp-query': Plug,
  finale: Sparkles,
}

function pct(state: ActivityState): number | undefined {
  if (state.done == null || state.total == null || state.total <= 0) return undefined
  return Math.min(100, Math.round((state.done / state.total) * 100))
}

export function ActivityBanner({ className = '' }: { className?: string }) {
  const labels = uiLabels()
  const { globalActivity, brainRunning, cancelBrainPipeline } = useStore()
  if (globalActivity.kind === 'idle' || globalActivity.kind === 'finale') return null

  const Icon = ICONS[globalActivity.kind]
  const progress = pct(globalActivity)
  const showCancel = globalActivity.kind === 'distill' && brainRunning

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border border-mint/35 bg-mint/10 px-4 py-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-mint" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {labels.activityBanner(globalActivity)}
        </span>
        {showCancel && (
          <Button variant="soft" onClick={cancelBrainPipeline} className="!px-2.5 !py-1 !text-[11px] shrink-0">
            {labels.cancel}
          </Button>
        )}
      </div>
      {progress != null && <ProgressBar value={Math.max(progress, 6)} />}
    </div>
  )
}
