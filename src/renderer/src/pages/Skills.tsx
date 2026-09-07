// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useState } from 'react'
import { ArrowLeft, FolderOpen, FileText, Wand2 } from 'lucide-react'
import { Button, Spinner } from '../components/ui'
import { ListRow, ListSection } from '../components/EntityList'
import { relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { api } from '../lib/api'
import type { LocalSkillEntry } from '../lib/types'
import { useStore } from '../store/useStore'

/**
 * This page's row layout is the house standard for "a directory of markdown
 * the user owns" — Mini's skills and both prompt libraries use the same one,
 * out of components/EntityList, so they cannot drift into three versions of
 * the same list.
 */
function SkillRow({
  skill,
  labels,
}: {
  skill: LocalSkillEntry
  labels: ReturnType<typeof uiLabels>
}) {
  return (
    <ListRow
      title={skill.name}
      subtitle={skill.description}
      meta={[
        labels.skillsSize(skill.sizeBytes),
        skill.category,
        relativeTime(new Date(skill.mtimeMs).toISOString()),
      ]}
      actions={[
        {
          label: labels.skillsOpenFile,
          icon: FileText,
          onClick: () => void api.skillsReveal(skill.path, 'file'),
        },
        {
          label: labels.skillsOpenFolder,
          icon: FolderOpen,
          onClick: () => void api.skillsReveal(skill.folderPath, 'folder'),
        },
      ]}
    />
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
            <ListSection
              title={labels.skillsSectionOwn}
              count={own.length}
              empty={labels.skillsEmptyOwn}
            >
              {own.map((s) => (
                <SkillRow key={`own:${s.name}`} skill={s} labels={labels} />
              ))}
            </ListSection>

            <ListSection
              title={labels.skillsSectionImported}
              count={imported.length}
              empty={labels.skillsEmptyImported}
            >
              {imported.map((s) => (
                <SkillRow key={`imported:${s.category ?? ''}/${s.name}`} skill={s} labels={labels} />
              ))}
            </ListSection>
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
