// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useState } from 'react'
import { ArrowLeft, FolderOpen, FileText, Wand2 } from 'lucide-react'
import { Button, GlassCard, Spinner } from '../components/ui'
import { relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { api } from '../lib/api'
import type { LocalSkillEntry } from '../lib/types'
import { useStore } from '../store/useStore'

function SkillRow({
  skill,
  openFileLabel,
  openFolderLabel,
  sizeLabel,
}: {
  skill: LocalSkillEntry
  openFileLabel: string
  openFolderLabel: string
  sizeLabel: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/5 px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{skill.name}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-dim">
          {skill.description || '—'}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-ink-faint">
          <span>{sizeLabel}</span>
          <span>{relativeTime(new Date(skill.mtimeMs).toISOString())}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-iris hover:bg-white/5 hover:text-cyan"
          onClick={() => void api.skillsReveal(skill.path, 'file')}
        >
          <FileText className="h-3 w-3" />
          {openFileLabel}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-iris hover:bg-white/5 hover:text-cyan"
          onClick={() => void api.skillsReveal(skill.folderPath, 'folder')}
        >
          <FolderOpen className="h-3 w-3" />
          {openFolderLabel}
        </button>
      </div>
    </div>
  )
}

export default function Skills() {
  const { vault, setRoute } = useStore()
  const labels = uiLabels()
  const [loading, setLoading] = useState(false)
  const [own, setOwn] = useState<LocalSkillEntry[]>([])
  const [imported, setImported] = useState<LocalSkillEntry[]>([])

  useEffect(() => {
    if (!vault.open) return
    setLoading(true)
    void api
      .skillsList()
      .then((r) => {
        setOwn(r.own)
        setImported(r.imported)
      })
      .finally(() => setLoading(false))
  }, [vault.open])

  if (!vault.open) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl glass">
          <Wand2 className="h-7 w-7 text-ink-faint" />
        </div>
        <h2 className="text-lg font-semibold text-ink">{labels.dashboardNoVaultTitle}</h2>
        <p className="mt-1 text-sm text-ink-dim">{labels.dashboardNoVaultDetail}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <button
          type="button"
          onClick={() => setRoute('dashboard')}
          className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-iris hover:text-cyan"
        >
          <ArrowLeft className="h-3 w-3" />
          {labels.skillsBack}
        </button>
        <h1 className="text-xl font-bold tracking-tight text-grad">{labels.skillsPageTitle}</h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-dim">{labels.skillsPageLead}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-ink-dim">
            <Spinner className="h-4 w-4" />
          </div>
        ) : (
          <>
            <GlassCard className="overflow-hidden p-0">
              <div className="border-b border-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {labels.skillsSectionOwn} · {own.length}
              </div>
              {own.length === 0 ? (
                <p className="px-3 py-4 text-xs text-ink-dim">{labels.skillsEmptyOwn}</p>
              ) : (
                own.map((s) => (
                  <SkillRow
                    key={`own:${s.name}`}
                    skill={s}
                    openFileLabel={labels.skillsOpenFile}
                    openFolderLabel={labels.skillsOpenFolder}
                    sizeLabel={labels.skillsSize(s.sizeBytes)}
                  />
                ))
              )}
            </GlassCard>

            <GlassCard className="overflow-hidden p-0">
              <div className="border-b border-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {labels.skillsSectionImported} · {imported.length}
              </div>
              {imported.length === 0 ? (
                <p className="px-3 py-4 text-xs text-ink-dim">{labels.skillsEmptyImported}</p>
              ) : (
                imported.map((s) => (
                  <SkillRow
                    key={`imported:${s.name}`}
                    skill={s}
                    openFileLabel={labels.skillsOpenFile}
                    openFolderLabel={labels.skillsOpenFolder}
                    sizeLabel={labels.skillsSize(s.sizeBytes)}
                  />
                ))
              )}
            </GlassCard>
          </>
        )}
      </div>

      <div className="mt-2 shrink-0">
        <Button variant="soft" onClick={() => setRoute('dashboard')} className="!px-2.5 !py-1.5 !text-xs">
          {labels.skillsBack}
        </Button>
      </div>
    </div>
  )
}
