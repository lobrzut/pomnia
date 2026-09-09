// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The skills on the server — see them, and change them.
 *
 * Three screens in one page, because there are 1259 skills and a flat list of
 * them is not a screen anybody can use: the categories, the skills inside one
 * category, and the editor. Search cuts across all of it.
 *
 * The first version asked `/sync/manifest` and drew whatever came back. That
 * is the replication endpoint — a sha256 of every file in the vault — so it
 * took 59.6 seconds, returned 2.8 MB, and reported 8044 entries where there
 * are 1259 skills, because backups belong in a replication manifest by design.
 * It now asks `/admin/skills`, which answers the question actually being asked.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, RefreshCw, Search } from 'lucide-react'

import type { RemoteSkillRow, RemoteSkillsSummary } from '@core/brain/remoteSkills'

import { Button, GlassCard, Spinner } from '../components/ui'
import { ListRow, ListSection } from '../components/EntityList'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

export default function MiniSkills() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const setRoute = useStore((s) => s.setRoute)

  const [summary, setSummary] = useState<RemoteSkillsSummary | null>(null)
  const [error, setError] = useState<{ code: string; detail: string } | null>(null)
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<{ rows: RemoteSkillRow[]; total: number } | null>(null)
  const [open, setOpen] = useState<RemoteSkillRow | null>(null)
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.skillsRemoteList()
      if ('error' in r) {
        setError({ code: r.error, detail: r.detail })
        setSummary(null)
      } else {
        setError(null)
        setSummary(r)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  // Narrowing is a server round-trip, so it waits for the typing to settle
  // rather than firing per keystroke against a thousand-entry catalogue.
  useEffect(() => {
    const q = query.trim()
    if (!category && q.length < 2) {
      setRows(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const r = await api.skillsRemoteListIn({
            category: category ?? undefined,
            query: q || undefined,
          })
          if (cancelled) return
          if ('error' in r) {
            setError({ code: r.error, detail: r.detail })
            setRows({ rows: [], total: 0 })
          } else {
            setError(null)
            setRows({ rows: r.rows, total: r.total })
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [category, query])

  async function openSkill(s: RemoteSkillRow) {
    setOpen(s)
    setText('')
    setOriginal('')
    const r = await api.skillsRemoteRead(s.path)
    if ('error' in r) {
      toast({ kind: 'error', title: labels.skillsRemoteReason(r.error), detail: r.detail })
      setOpen(null)
      return
    }
    setText(r.content)
    setOriginal(r.content)
  }

  async function save() {
    if (!open) return
    setSaving(true)
    try {
      const r = await api.skillsRemoteWrite(open.path, text)
      if ('error' in r) {
        toast({ kind: 'error', title: labels.skillsRemoteReason(r.error), detail: r.detail })
        return
      }
      setOriginal(text)
      toast({
        kind: 'success',
        title: r.unchanged ? labels.skillsSavedUnchanged : labels.skillsSaved(open.name),
        detail: labels.skillsSavedDetail,
      })
    } finally {
      setSaving(false)
    }
  }

  async function remove(s: RemoteSkillRow) {
    const r = await api.skillsRemoteDelete(s.path)
    if ('error' in r) {
      toast({ kind: 'error', title: labels.skillsRemoteReason(r.error), detail: r.detail })
      return
    }
    toast({ kind: 'success', title: labels.skillDeleted(s.name) })
    if (open?.path === s.path) setOpen(null)
    // Either view can be showing this row, so both are refreshed.
    void loadSummary()
    if (category || query.trim().length >= 2) {
      const again = await api.skillsRemoteListIn({
        category: category ?? undefined,
        query: query.trim() || undefined,
      })
      if (!('error' in again)) setRows({ rows: again.rows, total: again.total })
    }
  }

  const dirty = open !== null && text !== original
  const narrowed = category !== null || query.trim().length >= 2

  /** Defined here rather than at module scope: it closes over openSkill and remove. */
  const SkillRow = ({ skill }: { skill: RemoteSkillRow }) => (
    <ListRow
      title={skill.name}
      subtitle={skill.description}
      meta={[skill.category, skill.path]}
      copyText={skill.name}
      actions={[{ label: labels.rowEdit, onClick: () => void openSkill(skill) }]}
      onDelete={() => void remove(skill)}
      deleteLabel={labels.rowDelete}
      confirmLabel={labels.rowDeleteConfirm}
    />
  )

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <BookOpen className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.skillsTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.skillsLead}</p>
        </div>
        <Button variant="soft" onClick={() => void loadSummary()} disabled={loading}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {labels.skillsRefresh}
        </Button>
      </div>

      {error && (
        <GlassCard className="mb-5 p-5">
          <p className="text-xs text-amber">{labels.skillsRemoteReason(error.code)}</p>
          {/* A rejected token is fixed in one place, so the page says where. */}
          {(error.code === 'unauthorized' || error.code === 'no-token') && (
            <Button className="mt-3" variant="soft" onClick={() => setRoute('settings')}>
              {labels.navSettings}
            </Button>
          )}
        </GlassCard>
      )}

      {open ? (
        <MarkdownEditor
          title={open.name}
          subtitle={open.path}
          text={text}
          onChange={setText}
          onClose={() => setOpen(null)}
          onSave={() => void save()}
          saving={saving}
          dirty={dirty}
        />
      ) : (
        <>
          {/* Making a skill from a book moved to "Do Pomnia": it is an import,
              and this page is the list of what already exists. */}
          <div className="mb-4 flex items-center gap-2">
            {category && (
              <Button variant="soft" onClick={() => setCategory(null)}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {labels.skillsBackToCategories}
              </Button>
            )}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={labels.skillsSearchPlaceholder}
                spellCheck={false}
                className="no-drag w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
              />
            </div>
          </div>

          {narrowed ? (
            rows === null ? (
              <GlassCard className="p-5">
                <Spinner className="h-4 w-4" />
              </GlassCard>
            ) : (
              <div className="max-h-[58vh] overflow-y-auto">
                <ListSection
                  title={category ? labels.skillsCategorySection(category) : labels.skillsPacksHeading}
                  count={rows.total}
                  empty={labels.skillsNoMatch}
                >
                  {rows.rows.map((s) => (
                    <SkillRow key={s.path} skill={s} />
                  ))}
                </ListSection>
              </div>
            )
          ) : summary === null ? (
            <GlassCard className="p-5">
              <Spinner className="h-4 w-4" />
            </GlassCard>
          ) : (
            <div className="space-y-3">
              <ListSection
                title={labels.skillsOwnHeading}
                count={summary.own.length}
                empty={labels.skillsEmpty}
              >
                {summary.own.map((s) => (
                  <SkillRow key={s.path} skill={s} />
                ))}
              </ListSection>

              {/* Categories are navigation, not files: no edit, and nothing to
                  delete — removing a category would mean removing every skill
                  inside it, which is not a thing to offer behind one button. */}
              <ListSection title={labels.skillsPacksHeading} count={summary.cliCount}>
                {summary.categories.map((c) => (
                  <ListRow
                    key={c.category}
                    title={c.category}
                    subtitle={labels.skillsCategoryCount(c.count)}
                    onOpen={() => setCategory(c.category)}
                  />
                ))}
              </ListSection>
            </div>
          )}
        </>
      )}
    </div>
  )
}
