// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useState } from 'react'
import { ArrowLeft, FolderOpen, FileText, Pencil, Wand2 } from 'lucide-react'
import { Button, GlassCard, Spinner } from '../components/ui'
import { ListRow, ListSection } from '../components/EntityList'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { useEditableFile } from '../lib/useEditableFile'
import { relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { api } from '../lib/api'
import { skillForAgent } from '../lib/copyForAgent'
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
  onEdit,
  onDelete,
}: {
  skill: LocalSkillEntry
  labels: ReturnType<typeof uiLabels>
  onEdit: () => void
  onDelete: () => void
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
      copyText={async () => {
        const r = await api.skillsRead(skill.path)
        if (!r.ok) throw new Error(r.error)
        return skillForAgent(r.text)
      }}
      actions={[
        // Editing first: it is the one thing you cannot do anywhere else.
        // Revealing the file stays, for anyone who prefers their own editor.
        { label: labels.rowEdit, icon: Pencil, onClick: onEdit },
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
      onDelete={onDelete}
      deleteLabel={labels.rowDelete}
      confirmLabel={labels.rowDeleteConfirm}
    />
  )
}

/**
 * Imported packages, grouped the way they sit on disk.
 *
 * There are 1244 of them in the vault this was measured against. One flat run
 * of 1244 rows is the same wall the MCP listing was: you cannot find anything
 * in it, and the page has to build every row before it can show you the first.
 * Eight category lines are something you can aim at.
 */
function byCategory(skills: LocalSkillEntry[]): { category: string; skills: LocalSkillEntry[] }[] {
  const groups = new Map<string, LocalSkillEntry[]>()
  for (const s of skills) {
    const key = s.category ?? ''
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  return [...groups.entries()]
    .map(([category, list]) => ({ category, skills: list }))
    .sort((a, b) => b.skills.length - a.skills.length || a.category.localeCompare(b.category))
}

export default function Skills() {
  const { vault, setRoute } = useStore()
  const labels = uiLabels()
  const [loading, setLoading] = useState(false)
  const [own, setOwn] = useState<LocalSkillEntry[]>([])
  const [imported, setImported] = useState<LocalSkillEntry[]>([])
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const toast = useStore((st) => st.toast)
  const editor = useEditableFile<LocalSkillEntry>({
    read: (s) => api.skillsRead(s.path),
    write: (s, text) => api.skillsWrite(s.path, text),
    name: (s) => s.name,
    // The description shown in the list comes from the file that just changed.
    onSaved: () => reload(),
  })

  function reload(): void {
    setLoading(true)
    void api
      .skillsList()
      .then((r) => {
        setOwn(r.own)
        setImported(r.imported)
      })
      .finally(() => setLoading(false))
  }

  async function remove(skill: LocalSkillEntry): Promise<void> {
    const r = await api.skillsDelete(skill.path)
    if (!r.ok) {
      toast({ kind: 'error', title: labels.skillsRemoteReason('failed'), detail: r.error })
      return
    }
    toast({ kind: 'success', title: labels.skillDeleted(skill.name) })
    editor.closeIf((e) => e.path === skill.path)
    reload()
  }

  useEffect(() => {
    if (!vault.open) return
    reload()
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

      {/* Making a skill from a book moved to Import: it is an act of bringing
          something in, and this page lists what is already here. */}
      {editor.editing ? (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          <MarkdownEditor
            title={editor.editing.name}
            subtitle={editor.editing.path}
            text={editor.text}
            onChange={editor.setText}
            onClose={editor.close}
            onSave={() => void editor.save()}
            saveLabel={labels.skillsSaveLocal}
            saving={editor.saving}
            dirty={editor.dirty}
          />
        </div>
      ) : (
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
                <SkillRow
                  key={`own:${s.name}`}
                  skill={s}
                  labels={labels}
                  onEdit={() => void editor.open(s)}
                  onDelete={() => void remove(s)}
                />
              ))}
            </ListSection>

            {openCategory === null ? (
              <ListSection
                title={labels.skillsSectionImported}
                count={imported.length}
                empty={labels.skillsEmptyImported}
              >
                {byCategory(imported).map((g) => (
                  <ListRow
                    key={g.category || '(flat)'}
                    title={g.category || labels.skillsUncategorised}
                    subtitle={labels.skillsCategoryCount(g.skills.length)}
                    onOpen={() => setOpenCategory(g.category)}
                  />
                ))}
              </ListSection>
            ) : (
              <ListSection
                title={labels.skillsCategorySection(openCategory || labels.skillsUncategorised)}
                count={imported.filter((s) => (s.category ?? '') === openCategory).length}
                empty={labels.skillsEmptyImported}
              >
                <div className="border-b border-white/5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenCategory(null)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-iris hover:text-cyan"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    {labels.skillsBackToCategories}
                  </button>
                </div>
                {imported
                  .filter((s) => (s.category ?? '') === openCategory)
                  .map((s) => (
                    <SkillRow
                      key={`imported:${s.category ?? ''}/${s.name}`}
                      skill={s}
                      labels={labels}
                      onEdit={() => void editor.open(s)}
                      onDelete={() => void remove(s)}
                    />
                  ))}
              </ListSection>
            )}
          </>
        )}
      </div>
      )}

      <div className="mt-2 shrink-0">
        <Button variant="soft" onClick={() => setRoute('dashboard')} className="!px-2.5 !py-1.5 !text-xs">
          {labels.skillsBack}
        </Button>
      </div>
    </div>
  )
}
