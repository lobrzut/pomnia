// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The skills on the server — see them, and change them.
 *
 * The full app edits skills because it holds the vault. Mini does not, so it
 * reaches them the way everything else here does: over the replication
 * endpoints, with the admin token that never leaves main. Same files, same
 * door, no second copy on this machine.
 *
 * Read and write on one screen rather than two, because the reason to open a
 * skill is almost always to change a line of it.
 */

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, RefreshCw, Save } from 'lucide-react'

import { Button, GlassCard, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

type Skill = { path: string; kind: 'brain' | 'cli' | 'other'; name: string; size: number }

export default function MiniSkills() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Skill | null>(null)
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.skillsRemoteList()
      if ('error' in r) {
        setError(labels.skillsRemoteReason(r.error))
        setSkills([])
      } else {
        setError(null)
        setSkills(r.skills)
      }
    } finally {
      setLoading(false)
    }
  }, [labels])

  useEffect(() => {
    void load()
  }, [load])

  async function openSkill(s: Skill) {
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
      void load()
    } finally {
      setSaving(false)
    }
  }

  const dirty = open !== null && text !== original

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
        <Button variant="soft" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {labels.skillsRefresh}
        </Button>
      </div>

      {error && (
        <GlassCard className="mb-5 p-5">
          <p className="text-xs text-amber">{error}</p>
        </GlassCard>
      )}

      {open ? (
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{open.name}</div>
              <div className="truncate font-mono text-[11px] text-ink-faint">{open.path}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="soft" onClick={() => setOpen(null)}>
                {labels.skillsBackToList}
              </Button>
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {labels.skillsSave}
              </Button>
            </div>
          </div>
          {/* Plain textarea on purpose: this is a markdown file on a server, and
              an editor that reformats it would rewrite lines nobody touched. */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="no-drag h-[46vh] w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-ink"
          />
          <p className="mt-2 text-[11px] text-ink-faint">
            {dirty ? labels.skillsDirty : labels.skillsSavedHint}
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="p-5">
          {skills === null ? (
            <Spinner className="h-4 w-4" />
          ) : skills.length === 0 ? (
            <p className="text-xs text-ink-faint">{labels.skillsEmpty}</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-ink-dim">{labels.skillsCount(skills.length)}</p>
              <div className="max-h-[60vh] space-y-2 overflow-auto">
                {skills.map((s) => (
                  <button
                    key={s.path}
                    onClick={() => void openSkill(s)}
                    className="no-drag flex w-full items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-left hover:border-white/16"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-ink">{s.name}</div>
                      <div className="truncate text-[11px] text-ink-faint">{s.path}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {labels.skillsKind(s.kind)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      )}
    </div>
  )
}
