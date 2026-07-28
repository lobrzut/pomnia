// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  Database,
  HelpCircle,
  MessageSquare,
  RefreshCw,
  Server,
  Layers,
  Sparkles,
  BookOpen,
  Wand2
} from 'lucide-react'
import { Badge, Button, GlassCard, Input, ProgressBar, SourceTile, Spinner } from '../components/ui'
import { ActivityBanner } from '../components/ActivityBanner'
import { StatusStrip } from '../components/StatusStrip'
import { humanBytes, relativeTime, shortPath, sourceMeta } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { isMcpClientActive } from '../lib/mcpClientVisibility'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { ClientId } from '../lib/types'

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  delay,
  onClick,
}: {
  icon: typeof Database
  label: string
  value: string | number
  sub?: string
  delay: number
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0 text-iris" />
      </div>
      <div className="mt-1 text-xl font-bold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[10px] text-ink-dim">{sub}</div>}
    </>
  )
  if (onClick) {
    return (
      <GlassCard delay={delay} className="p-2.5">
        <button type="button" onClick={onClick} className="no-drag block w-full text-left hover:opacity-90">
          {inner}
        </button>
      </GlassCard>
    )
  }
  return (
    <GlassCard delay={delay} className="p-2.5">
      {inner}
    </GlassCard>
  )
}

export default function Dashboard() {
  const {
    sources,
    scanning,
    scan,
    selected,
    toggleSelected,
    selectAll,
    backup,
    backupAndDistill,
    backingUp,
    backupPhase,
    vault,
    backupNote,
    setBackupNote,
    setRoute,
    brainState,
    brainRunning,
    brainProgress,
    globalActivity,
    refreshVault,
    loadBrainState,
    mcpClients,
    loadMcpClients,
    connectClientOverride,
  } = useStore()
  const labels = uiLabels()
  const busy = backingUp || brainRunning

  const installed = useMemo(() => sources.filter((s) => s.installed), [sources])
  const totals = useMemo(
    () => ({
      chats: installed.reduce((n, s) => n + (s.conversations ?? 0), 0),
      bytes: installed.reduce((n, s) => n + s.sizeBytes, 0)
    }),
    [installed]
  )
  const allSelected = installed.length > 0 && installed.every((s) => selected.has(s.id))
  const activityLine =
    globalActivity.kind !== 'idle' && globalActivity.kind !== 'finale'
      ? labels.dashboardActivityNow(globalActivity)
      : brainState?.lastRun
        ? labels.dashboardActivityLast(relativeTime(brainState.lastRun))
        : labels.dashboardActivityNone

  const barPhase = backingUp
    ? backupPhase || labels.dashboardWorking
    : brainRunning
      ? brainProgress?.label || labels.dashboardDistilling
      : null

  const skillsOwn = vault.skillsOwnCount ?? 0
  const skillsImported = vault.skillsImportedCount ?? 0
  const skillsCount = vault.skillsCount ?? skillsOwn + skillsImported
  const distilledNotes = vault.distilledNotes ?? brainState?.distilled ?? 0
  const knowledgeSub = vault.open
    ? shortPath(vault.knowledgePath ?? vault.path ?? vault.name ?? '', 22)
    : labels.dashboardStatKnowledgeClosed
  const skillsValue =
    vault.open && (skillsOwn > 0 || skillsImported > 0 || skillsCount > 0)
      ? skillsCount
      : skillsCount || '—'
  const skillsSub = vault.open
    ? labels.dashboardStatSkillsSub(skillsOwn, skillsImported)
    : labels.dashboardStatSnapshotsClosed

  useEffect(() => {
    void api.mcpActivityWatch(true)
    void loadBrainState()
    void refreshVault()
    void loadMcpClients()
    return () => {
      void api.mcpActivityWatch(false)
    }
  }, [loadBrainState, refreshVault, loadMcpClients])

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
      <ActivityBanner className="mb-2 shrink-0" />
      <StatusStrip />

      <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-1 text-[11px] text-ink-dim">
        <span className="min-w-0 truncate">{activityLine}</span>
        <button
          type="button"
          onClick={() => setRoute('guide')}
          className="no-drag shrink-0 font-medium text-iris hover:text-cyan"
        >
          {labels.guideFlowMiniExpand}
        </button>
      </div>

      <div className="mb-2 flex shrink-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-grad">{labels.dashboardTitle}</h1>
          <p className="mt-0.5 line-clamp-1 text-xs text-ink-dim">{labels.dashboardLead}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setRoute('guide')}
            className="no-drag hidden text-[11px] font-medium text-iris hover:text-cyan sm:inline"
          >
            {labels.helpDontKnowStart}
          </button>
          <Button variant="soft" onClick={() => scan()} disabled={scanning} className="!px-2.5 !py-1.5 !text-xs">
            {scanning ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Rescan
          </Button>
        </div>
      </div>

      <div className="mb-2 grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat
          icon={Server}
          label={labels.dashboardStatSources}
          value={installed.length}
          sub={labels.dashboardStatSourcesSub}
          delay={0.02}
        />
        <Stat
          icon={MessageSquare}
          label={labels.dashboardStatChats}
          value={totals.chats || '—'}
          sub={labels.dashboardStatChatsSub}
          delay={0.04}
        />
        <Stat
          icon={Layers}
          label={labels.dashboardStatSnapshots}
          value={vault.snapshots}
          sub={vault.open ? vault.name : labels.dashboardStatSnapshotsClosed}
          delay={0.06}
        />
        <Stat
          icon={Wand2}
          label={labels.dashboardStatSkills}
          value={skillsValue}
          sub={skillsSub}
          delay={0.08}
          onClick={vault.open ? () => setRoute('skills') : undefined}
        />
        <Stat
          icon={BookOpen}
          label={labels.dashboardStatDistilled}
          value={distilledNotes}
          sub={labels.dashboardStatDistilledSub}
          delay={0.1}
        />
        <Stat
          icon={Database}
          label={labels.dashboardStatKnowledge}
          value={vault.open ? labels.dashboardStatKnowledgeOpen : labels.dashboardStatKnowledgeClosed}
          sub={knowledgeSub}
          delay={0.12}
        />
      </div>

      <div className="mb-1.5 flex shrink-0 items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          {labels.dashboardSourcesHeading}
        </h2>
        <button
          onClick={() =>
            selectAll(allSelected ? [] : installed.map((s) => s.id))
          }
          className="text-[11px] font-medium text-iris hover:text-cyan"
        >
          {allSelected ? labels.dashboardDeselectAll : labels.dashboardSelectAll}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2 pb-1">
          {scanning && installed.length === 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-[72px] rounded-[var(--radius-xl)]" />
            ))
          ) : installed.length === 0 ? (
            <div className="col-span-2 flex flex-col items-center gap-1.5 rounded-[var(--radius-xl)] border border-dashed border-white/10 px-4 py-6 text-center">
              <Server className="h-5 w-5 text-ink-faint" />
              <p className="text-sm text-ink-dim">{labels.dashboardNoSourcesTitle}</p>
              <p className="max-w-sm text-[11px] leading-relaxed text-ink-faint">{labels.dashboardNoSourcesDetail}</p>
            </div>
          ) : (
            installed.map((s, i) => {
              const meta = sourceMeta(s.id)
              const on = selected.has(s.id)
              const strategyLabel =
                s.strategy === 'hybrid' ? labels.strategyHybrid : labels.strategySnapshot
              const chatsLabel =
                s.conversations != null && s.conversations > 0
                  ? labels.sourceChatsCount(s.conversations)
                  : labels.sourceNoChats
              const mcpActive = isMcpClientActive(s.id as ClientId, mcpClients, connectClientOverride)
              return (
                <GlassCard
                  key={s.id}
                  delay={0.03 * i}
                  hover
                  onClick={() => toggleSelected(s.id)}
                  className="relative overflow-hidden p-2.5"
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[var(--radius-xl)] transition-opacity"
                    style={{
                      opacity: on ? 1 : 0,
                      boxShadow: 'inset 0 0 0 1.5px #34d399aa, inset 0 0 60px -30px #34d399'
                    }}
                  />
                  <div className="relative flex items-center gap-2.5">
                    <SourceTile glyph={meta.glyph} color={meta.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink">{s.label}</span>
                        <Badge color={s.strategy === 'hybrid' ? '#34d399' : '#9aa3bd'}>
                          {strategyLabel}
                        </Badge>
                        {s.strategy === 'snapshot' && (
                          <span
                            className="inline-flex text-ink-faint"
                            title={labels.strategySnapshotHint}
                            aria-label={labels.strategySnapshotHint}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <HelpCircle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0 text-[11px] text-ink-dim">
                        <span>{humanBytes(s.sizeBytes)}</span>
                        <span>{chatsLabel}</span>
                      </div>
                      {mcpActive ? (
                        <p className="mt-0.5 text-[10px] leading-snug text-mint">{labels.sourceMcpReads}</p>
                      ) : (
                        <button
                          type="button"
                          className="no-drag mt-0.5 block text-left text-[10px] leading-snug text-ink-faint hover:text-cyan"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRoute('connect')
                          }}
                        >
                          {labels.sourceMcpNotConnected}
                        </button>
                      )}
                      {s.notes?.some((n) => /too large|skipped|agent-transcripts/i.test(n)) && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-ink-faint">
                          {s.notes.find((n) => /agent-transcripts|too large|skipped/i.test(n))}
                        </p>
                      )}
                    </div>
                    <motion.div
                      animate={{ scale: on ? 1 : 0.6, opacity: on ? 1 : 0 }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-mint"
                    >
                      <Check className="h-3 w-3 text-black" strokeWidth={3} />
                    </motion.div>
                  </div>
                </GlassCard>
              )
            })
          )}
        </div>
      </div>

      {/* Backup + Distill — pinned to bottom of flex column (no sticky scroll-trap) */}
      <motion.div layout className="mt-2 shrink-0">
        <GlassCard className="flex items-center gap-3 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl accent-grad ring-glow">
            <Database className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            {busy ? (
              <>
                <div className="mb-1 text-sm font-medium text-ink">{barPhase}</div>
                <ProgressBar indeterminate />
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-ink">
                  {labels.dashboardSourcesSelected(selected.size)}
                </div>
                <div className="truncate text-[11px] text-ink-dim">
                  {vault.open
                    ? labels.dashboardReadyVault(vault.name ?? 'vault')
                    : labels.dashboardOpenVaultHint}
                </div>
              </>
            )}
          </div>
          <div className="hidden w-44 shrink-0 md:block">
            <Input
              value={backupNote}
              onChange={(e) => setBackupNote(e.target.value)}
              placeholder={labels.dashboardBackupNotePlaceholder}
              disabled={busy}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              variant="ghost"
              onClick={() => void backup(backupNote)}
              disabled={busy || !vault.open || selected.size === 0}
              className="!px-2.5 !text-xs text-ink-dim"
            >
              {backingUp && !brainRunning ? <Spinner className="h-3.5 w-3.5" /> : null}
              {labels.dashboardBackupOnly}
            </Button>
            <Button
              onClick={() => void backupAndDistill(backupNote)}
              disabled={busy || !vault.open || selected.size === 0}
              className="!px-3 !text-xs"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {labels.dashboardBackupAndBrain}
            </Button>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  )
}
