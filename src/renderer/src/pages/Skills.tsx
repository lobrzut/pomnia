// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BookUp, FolderOpen, FileText, Wand2 } from 'lucide-react'
import { Button, GlassCard, Spinner } from '../components/ui'
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
  onDelete,
}: {
  skill: LocalSkillEntry
  labels: ReturnType<typeof uiLabels>
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
      copyText={skill.name}
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
  const [category, setCategory] = useState('general')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const unsub = useRef<(() => void) | null>(null)
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const toast = useStore((st) => st.toast)

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
    reload()
  }

  useEffect(() => {
    if (!vault.open) return
    reload()
  }, [vault.open])

  async function makeSkillFromBook() {
    const file = await api.skillsPickBook()
    if (!file) return
    setBusy(true)
    setProgress(null)
    // Progress arrives on a channel; drop the listener whatever happens, or a
    // second run would report twice.
    unsub.current = api.onSkillsFromBookProgress((p) =>
      setProgress(labels.bookSkillRunning(p.phase, p.done ?? 0, p.total ?? 0)),
    )
    try {
      const r = await api.skillsFromBook(file, category.trim() || 'general')
      if (!r.ok) {
        toast({ kind: 'error', title: labels.bookSkillFailed, detail: r.error })
        return
      }
      toast({
        kind: 'success',
        title: labels.bookSkillDone(r.slug, r.chapters),
        detail: r.warnings.length > 0 ? r.warnings.join(' · ') : r.path,
      })
      reload()
    } finally {
      unsub.current?.()
      unsub.current = null
      setBusy(false)
      setProgress(null)
    }
  }

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

      {/* A book becomes one skill, never one per chapter — the index is what
          stays loaded and the chapters are read one at a time. */}
      <GlassCard className="mb-3 shrink-0 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">{labels.bookSkillTitle}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-dim">{labels.bookSkillLead}</p>
          </div>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={labels.bookSkillCategory}
            spellCheck={false}
            disabled={busy}
            className="no-drag w-36 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint"
          />
          <Button onClick={() => void makeSkillFromBook()} disabled={busy}>
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <BookUp className="h-3.5 w-3.5" />}
            {labels.bookSkillPick}
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-ink-faint">{progress ?? labels.bookSkillNote}</p>
      </GlassCard>

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
                      onDelete={() => void remove(s)}
                    />
                  ))}
              </ListSection>
            )}
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
