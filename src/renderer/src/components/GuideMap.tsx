// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  CloudUpload,
  Database,
  FileText,
  HardDriveDownload,
  Plug,
  Search,
  Sparkles
} from 'lucide-react'
import clsx from 'clsx'
import { GlassCard } from './ui'
import { uiLabels } from '../lib/labels'
import { useStore, type Route } from '../store/useStore'

interface FlowStep {
  id: string
  icon: typeof Database
  accent: string
  title: string
  body: string
  where: string
  tab?: Route
  optional?: boolean
}

function FlowArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center px-1 text-ink-faint md:px-2">
      <ArrowRight className="hidden h-4 w-4 md:block" />
      <ChevronDown className="h-4 w-4 md:hidden" />
    </div>
  )
}

function StepCard({
  step,
  index,
  onOpenTab
}: {
  step: FlowStep
  index: number
  onOpenTab?: (tab: Route) => void
}) {
  const labels = uiLabels()
  const Icon = step.icon
  return (
    <GlassCard delay={0.04 * index} className={clsx('flex min-w-0 flex-1 flex-col p-4', step.optional && 'border-dashed')}>
      <div className="mb-2 flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${step.accent}22`, border: `1px solid ${step.accent}44` }}
        >
          <Icon className="h-4 w-4" style={{ color: step.accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-dim">{step.body}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/6 pt-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{step.where}</span>
        {step.tab && onOpenTab && (
          <button
            type="button"
            onClick={() => onOpenTab(step.tab!)}
            className="no-drag shrink-0 text-[11px] font-medium text-iris hover:text-cyan"
          >
            {labels.guideOpenTab} →
          </button>
        )}
      </div>
    </GlassCard>
  )
}

export function GuideMap({ onOpenTab, compact }: { onOpenTab?: (tab: Route) => void; compact?: boolean }) {
  const labels = uiLabels()

  const mainFlow: FlowStep[] = [
    {
      id: 'collect',
      icon: HardDriveDownload,
      accent: '#2dd4bf',
      title: labels.guideStep1Title,
      body: labels.guideStep1Body,
      where: labels.guideStep1Where,
      tab: 'dashboard'
    },
    {
      id: 'vault',
      icon: Database,
      accent: '#34d399',
      title: labels.guideStep2Title,
      body: labels.guideStep2Body,
      where: labels.guideStep2Where,
      tab: 'settings'
    },
    {
      id: 'distill',
      icon: Sparkles,
      accent: '#34d399',
      title: labels.guideStep3Title,
      body: labels.guideStep3Body,
      where: labels.guideStep3Where,
      tab: 'brain'
    },
    {
      id: 'search',
      icon: Search,
      accent: '#22d3ee',
      title: labels.guideStep4Title,
      body: labels.guideStep4Body,
      where: labels.guideStep4Where,
      tab: 'brain'
    },
    {
      id: 'cursor',
      icon: Plug,
      accent: '#2dd4bf',
      title: labels.guideStep5Title,
      body: labels.guideStep5Body,
      where: labels.guideStep5Where,
      tab: 'connect'
    }
  ]

  const optionalStep: FlowStep = {
    id: 'homelab',
    icon: CloudUpload,
    accent: '#fbbf24',
    title: labels.guideStepOptionalTitle,
    body: labels.guideStepOptionalBody,
    where: labels.guideStepOptionalWhere,
    tab: 'brain',
    optional: true
  }

  const docsStep: FlowStep = {
    id: 'docs',
    icon: FileText,
    accent: '#fb923c',
    title: labels.guideDocsTitle,
    body: labels.guideDocsBody,
    where: labels.guideDocsWhere,
    tab: 'import'
  }

  return (
    <div className={clsx(compact ? 'space-y-4' : 'space-y-6')}>
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
        {mainFlow.map((step, i) => (
          <div key={step.id} className="flex min-w-0 flex-1 flex-col md:flex-row md:items-stretch">
            <StepCard step={step} index={i} onOpenTab={onOpenTab} />
            {i < mainFlow.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>

      <GlassCard delay={0.22} className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-amber" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{labels.guideAltPath}</span>
        </div>
        <StepCard step={docsStep} index={5} onOpenTab={onOpenTab} />
      </GlassCard>

      <GlassCard delay={0.26} className="border-dashed p-4 opacity-90">
        <StepCard step={optionalStep} index={6} onOpenTab={onOpenTab} />
      </GlassCard>

      {!compact && onOpenTab && (
        <button
          type="button"
          onClick={() => onOpenTab('guide')}
          className="no-drag flex items-center gap-2 text-xs font-medium text-iris hover:text-cyan"
        >
          <BrainCircuit className="h-3.5 w-3.5" />
          {labels.guideFlowMiniExpand}
        </button>
      )}
    </div>
  )
}

/** Full-screen overlay — onboarding / help without leaving wizard. */
export function GuideOverlay({ onClose }: { onClose: () => void }) {
  const labels = uiLabels()
  const setRoute = useStore((s) => s.setRoute)
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const onboarded = useStore((s) => s.onboarded)

  function openTab(tab: Route) {
    if (!onboarded) completeOnboarding()
    setRoute(tab)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="no-drag absolute inset-0 z-50 flex items-center justify-center bg-void/85 p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="glass max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-iris">{labels.guideSubtitle}</p>
            <h2 className="mt-1 text-xl font-bold text-grad">{labels.guideTitle}</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-dim">{labels.guideLead}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-ink-dim hover:text-ink">
            Zamknij
          </button>
        </div>
        <GuideMap onOpenTab={openTab} compact />
      </motion.div>
    </motion.div>
  )
}
