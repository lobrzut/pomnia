// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The prompt library in this vault — `vault/prompts/*.md`.
 *
 * Built as the sibling of the Skills page, and on purpose: it lists what is on
 * disk and hands editing to the editor the user already uses, rather than
 * putting a second one inside Pomnia. A prompt is a document they own.
 *
 * What is worth showing that a file browser would not: the argument signature.
 * `{{objaw}}` in the body is what an agent will be asked to fill in, and a
 * required argument left empty is an error at use time. Seeing the signature
 * in the list is the difference between a directory and a library.
 */

import { useEffect, useState } from 'react'
import { FileText, FolderOpen, MessageSquareQuote, Plus } from 'lucide-react'

import { Button, GlassCard, Spinner } from '../components/ui'
import { relativeTime } from '../lib/format'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import type { LocalPromptEntry } from '../lib/types'
import { useStore } from '../store/useStore'

function PromptRow({
  prompt,
  labels,
}: {
  prompt: LocalPromptEntry
  labels: ReturnType<typeof uiLabels>
}) {
  return (
    <div className="flex items-start gap-3 border-b border-white/5 px-3 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-semibold text-ink">/{prompt.name}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-dim">
          {prompt.description || '—'}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-ink-faint">
          <span>
            {prompt.arguments.length === 0
              ? labels.promptsNoArgs
              : `${labels.promptsArgsLabel} ${prompt.arguments
                  .map((a) => (a.required ? `${a.name}*` : a.name))
                  .join(', ')}`}
          </span>
          <span>{relativeTime(new Date(prompt.mtimeMs).toISOString())}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-iris hover:bg-white/5 hover:text-cyan"
          onClick={() => void api.skillsReveal(prompt.path, 'file')}
        >
          <FileText className="h-3 w-3" />
          {labels.promptsOpenFile}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-iris hover:bg-white/5 hover:text-cyan"
          onClick={() => void api.skillsReveal(prompt.folderPath, 'folder')}
        >
          <FolderOpen className="h-3 w-3" />
          {labels.promptsOpenFolder}
        </button>
      </div>
    </div>
  )
}

export default function Prompts() {
  const { vault } = useStore()
  const toast = useStore((s) => s.toast)
  const labels = uiLabels()
  const [loading, setLoading] = useState(false)
  const [prompts, setPrompts] = useState<LocalPromptEntry[]>([])
  const [root, setRoot] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  function reload() {
    setLoading(true)
    void api
      .promptsList()
      .then((r) => {
        setPrompts(r.prompts)
        setRoot(r.promptsRoot)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!vault.open) return
    reload()
  }, [vault.open])

  async function create() {
    const name = newName.trim()
    const r = await api.promptsCreate(name)
    if (!r.ok) {
      toast({ kind: 'error', title: labels.promptsNameBad, detail: r.error })
      return
    }
    setNewName('')
    toast({ kind: 'success', title: labels.promptsCreated(name) })
    reload()
    // The file is empty apart from its frontmatter, so the only useful next
    // step is writing it — open it where the user actually writes.
    void api.skillsReveal(r.path, 'file')
  }

  if (!vault.open) {
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl glass">
          <MessageSquareQuote className="h-7 w-7 text-ink-faint" />
        </div>
        <p className="text-sm text-ink-dim">{labels.promptsLeadLocal}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <MessageSquareQuote className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.promptsTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.promptsLeadLocal}</p>
        </div>
      </div>

      <GlassCard className="mb-4 p-4">
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
          <Button onClick={() => void create()} disabled={newName.trim() === ''}>
            <Plus className="h-3.5 w-3.5" />
            {labels.promptsCreate}
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">{labels.promptsHowItReaches}</p>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="p-5">
            <Spinner className="h-4 w-4" />
          </div>
        ) : prompts.length === 0 ? (
          <p className="p-5 text-xs text-ink-faint">{labels.promptsEmpty}</p>
        ) : (
          <>
            <p className="border-b border-white/5 px-3 py-2 text-xs text-ink-dim">
              {labels.promptsCount(prompts.length)}
            </p>
            {prompts.map((p) => (
              <PromptRow key={p.name} prompt={p} labels={labels} />
            ))}
          </>
        )}
      </GlassCard>

      {root && <p className="mt-3 truncate font-mono text-[10px] text-ink-faint">{root}</p>}
    </div>
  )
}
