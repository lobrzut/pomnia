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
import { FileText, FolderOpen, MessageSquareQuote, Pencil, Plus } from 'lucide-react'

import { Button, GlassCard, Spinner } from '../components/ui'
import { ListRow, ListSection } from '../components/EntityList'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { useEditableFile } from '../lib/useEditableFile'
import { relativeTime } from '../lib/format'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import type { LocalPromptEntry } from '../lib/types'
import { useStore } from '../store/useStore'

/** The argument signature, which is the one thing a file browser would not show. */
function signature(prompt: LocalPromptEntry, labels: ReturnType<typeof uiLabels>): string {
  if (prompt.arguments.length === 0) return labels.promptsNoArgs
  return `${labels.promptsArgsLabel} ${prompt.arguments
    .map((a) => (a.required ? `${a.name}*` : a.name))
    .join(', ')}`
}

function PromptRow({
  prompt,
  labels,
  onEdit,
  onDelete,
}: {
  prompt: LocalPromptEntry
  labels: ReturnType<typeof uiLabels>
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <ListRow
      title={`/${prompt.name}`}
      subtitle={prompt.description}
      meta={[signature(prompt, labels), relativeTime(new Date(prompt.mtimeMs).toISOString())]}
      copyText={`/${prompt.name}`}
      actions={[
        // Editing first: it is the one thing you cannot do anywhere else.
        { label: labels.rowEdit, icon: Pencil, onClick: onEdit },
        {
          label: labels.promptsOpenFile,
          icon: FileText,
          onClick: () => void api.skillsReveal(prompt.path, 'file'),
        },
        {
          label: labels.promptsOpenFolder,
          icon: FolderOpen,
          onClick: () => void api.skillsReveal(prompt.folderPath, 'folder'),
        },
      ]}
      onDelete={onDelete}
      deleteLabel={labels.rowDelete}
      confirmLabel={labels.rowDeleteConfirm}
    />
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
  const editor = useEditableFile<LocalPromptEntry>({
    read: (p) => api.promptsRead(p.name),
    write: (p, text) => api.promptsWrite(p.name, text),
    name: (p) => p.name,
    // Description and argument list both come from the frontmatter that changed.
    onSaved: () => reload(),
  })

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

  async function remove(name: string) {
    const r = await api.promptsDelete(name)
    if (!r.ok) {
      toast({ kind: 'error', title: labels.promptsNameBad, detail: r.error })
      return
    }
    toast({ kind: 'success', title: labels.promptDeleted(name) })
    editor.closeIf((e) => e.name === name)
    reload()
  }

  async function create(): Promise<void> {
    const name = newName.trim()
    const r = await api.promptsCreate(name)
    if (!r.ok) {
      toast({ kind: 'error', title: labels.promptsNameBad, detail: r.error })
      return
    }
    setNewName('')
    toast({ kind: 'success', title: labels.promptsCreated(name) })
    reload()
    // A new prompt is empty apart from its frontmatter, so the only useful next
    // step is writing it. That used to mean handing the file to the OS; now
    // that the editor is in the app, land in it.
    void editor.open({
      name,
      description: '',
      arguments: [],
      path: r.path,
      folderPath: root ?? '',
      sizeBytes: 0,
      mtimeMs: Date.now(),
    })
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

      {editor.editing ? (
        <MarkdownEditor
          title={`/${editor.editing.name}`}
          subtitle={editor.editing.path}
          text={editor.text}
          onChange={editor.setText}
          onClose={editor.close}
          onSave={() => void editor.save()}
          saveLabel={labels.skillsSaveLocal}
          saving={editor.saving}
          dirty={editor.dirty}
        />
      ) : (
      <>
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

      {loading ? (
        <GlassCard className="p-5">
          <Spinner className="h-4 w-4" />
        </GlassCard>
      ) : (
        <ListSection
          title={labels.promptsTitle}
          count={prompts.length}
          empty={labels.promptsEmpty}
        >
          {prompts.map((p) => (
            <PromptRow
              key={p.name}
              prompt={p}
              labels={labels}
              onEdit={() => void editor.open(p)}
              onDelete={() => void remove(p.name)}
            />
          ))}
        </ListSection>
      )}

      {root && <p className="mt-3 truncate font-mono text-[10px] text-ink-faint">{root}</p>}
      </>
      )}
    </div>
  )
}
