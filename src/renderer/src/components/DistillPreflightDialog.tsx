// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { DistillPreflightPanel } from './DistillPreflightPanel'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

/**
 * Shown when a distill run is refused. Sits under the title bar (z-50) so the
 * window can still be closed, and above the page so the backlog cannot keep
 * looking idle.
 */
export function DistillPreflightDialog() {
  const gate = useStore((s) => s.distillGate)
  const dismissDistillGate = useStore((s) => s.dismissDistillGate)
  const runBrainPipeline = useStore((s) => s.runBrainPipeline)
  const labels = uiLabels()
  if (!gate) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-void/80 p-6 backdrop-blur-md">
      <div className="glass w-full max-w-lg rounded-3xl p-6">
        <h2 className="text-lg font-bold tracking-tight text-ink">{labels.distillPreflightTitle}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{labels.distillPreflightLead}</p>
        <div className="mt-4">
          <DistillPreflightPanel
            ollamaUrl={gate.ollamaUrl}
            distillModel={gate.model}
            requireEmbed={gate.requireEmbed}
            continueLabel={labels.distillPreflightContinue}
            onContinue={() => {
              const pending = useStore.getState().distillGate
              if (!pending) return
              useStore.setState({ distillGate: null })
              void runBrainPipeline({ ...pending, preflightDone: true })
            }}
          />
        </div>
        <button
          type="button"
          onClick={dismissDistillGate}
          className="no-drag mt-3 text-[12px] text-ink-faint hover:text-ink"
        >
          {labels.distillPreflightDismiss}
        </button>
      </div>
    </div>
  )
}
