// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The prompt library on the server — read, edit, and add.
 *
 * The sibling of MiniSkills, and deliberately the same shape, because they are
 * the same job: markdown in the vault that an agent will read. What differs is
 * who acts on it. A skill is loaded mid-task by the agent; a prompt is served
 * over MCP `prompts/list` and reaches the user as `/name` in their client.
 *
 * Unlike skills, this screen can create. A library that starts empty and has
 * no way to gain a first entry is a directory listing, not a library — and the
 * server accepts a create here precisely because the file does not exist yet.
 */

import { useCallback, useEffect, useState } from 'react'
import { MessageSquareQuote, Plus, RefreshCw, Save } from 'lucide-react'

import type { RemotePrompt } from '@core/brain/remoteSkills'
import { isSafePromptName } from '@core/brain/remoteSkills'

import { Button, GlassCard, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

/** What a new prompt starts as: the frontmatter it needs and nothing it does not. */
const TEMPLATE = '---\ndescription: \n---\n'

export default function MiniPrompts() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const setRoute = useStore((s) => s.setRoute)

  const [prompts, setPrompts] = useState<RemotePrompt[] | null>(null)
  const [error, setError] = useState<{ code: string; detail: string } | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.promptsRemoteList()
      if ('error' in r) {
        setError({ code: r.error, detail: r.detail })
        setPrompts([])
      } else {
        setError(null)
        setPrompts(r.prompts)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function openPrompt(name: string) {
    setOpen(name)
    setText('')
    setOriginal('')
    const r = await api.promptsRemoteRead(name)
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
      const r = await api.promptsRemoteWrite(open, text)
      if ('error' in r) {
        toast({ kind: 'error', title: labels.skillsRemoteReason(r.error), detail: r.detail })
        return
      }
      setOriginal(text)
      toast({
        kind: 'success',
        title: r.unchanged ? labels.skillsSavedUnchanged : labels.promptsSaved(open),
        detail: labels.skillsSavedDetail,
      })
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function create() {
    const name = newName.trim()
    if (!isSafePromptName(name)) {
      toast({ kind: 'error', title: labels.promptsNameBad })
      return
    }
    setSaving(true)
    try {
      const r = await api.promptsRemoteWrite(name, TEMPLATE)
      if ('error' in r) {
        toast({ kind: 'error', title: labels.skillsRemoteReason(r.error), detail: r.detail })
        return
      }
      setNewName('')
      toast({ kind: 'success', title: labels.promptsCreated(name) })
      await load()
      // Straight into the editor: nobody creates a prompt in order to look at
      // its name in a list.
      await openPrompt(name)
    } finally {
      setSaving(false)
    }
  }

  const dirty = open !== null && text !== original

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <MessageSquareQuote className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.promptsTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.promptsLead}</p>
        </div>
        <Button variant="soft" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {labels.promptsRefresh}
        </Button>
      </div>

      {error && (
        <GlassCard className="mb-5 p-5">
          <p className="text-xs text-amber">{labels.skillsRemoteReason(error.code)}</p>
          {(error.code === 'unauthorized' || error.code === 'no-token') && (
            <Button className="mt-3" variant="soft" onClick={() => setRoute('settings')}>
              {labels.navSettings}
            </Button>
          )}
        </GlassCard>
      )}

      {open ? (
        <GlassCard className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">/{open}</div>
              <div className="truncate text-[11px] text-ink-faint">{labels.promptsHowItReaches}</div>
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
        <>
          <GlassCard className="mb-4 p-5">
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create()
                }}
                placeholder={labels.promptsNewName}
                spellCheck={false}
                className="no-drag min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint"
              />
              <Button onClick={() => void create()} disabled={saving || newName.trim() === ''}>
                <Plus className="h-3.5 w-3.5" />
                {labels.promptsCreate}
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            {prompts === null ? (
              <Spinner className="h-4 w-4" />
            ) : prompts.length === 0 ? (
              <p className="text-xs text-ink-faint">{labels.promptsEmpty}</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-dim">{labels.promptsCount(prompts.length)}</p>
                <div className="max-h-[58vh] space-y-2 overflow-auto">
                  {prompts.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => void openPrompt(p.name)}
                      className="no-drag flex w-full flex-col gap-1 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-left hover:border-white/16"
                    >
                      <div className="truncate font-mono text-sm text-ink">/{p.name}</div>
                      {p.description && (
                        <div className="line-clamp-2 text-[11px] leading-snug text-ink-dim">
                          {p.description}
                        </div>
                      )}
                      <div className="text-[10px] text-ink-faint">
                        {p.arguments.length === 0
                          ? labels.promptsNoArgs
                          : `${labels.promptsArgsLabel} ${p.arguments
                              .map((a) => (a.required ? `${a.name}*` : a.name))
                              .join(', ')}`}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </>
      )}
    </div>
  )
}
