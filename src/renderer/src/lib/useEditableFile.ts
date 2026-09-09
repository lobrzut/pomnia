// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Open a markdown file the user owns, change it, save it.
 *
 * Skills and prompts are the same object in different folders, so the desktop
 * had the same thirty lines twice — load, keep the loaded copy to compare
 * against, save, tell the list to refresh. Two copies of a rule about when a
 * document counts as changed is two places for it to become false.
 *
 * Mini is deliberately not folded in here. Its API answers with a different
 * error shape (`{ error, detail }` rather than `{ ok, error }`) and reports an
 * `unchanged` save the server detected, and a hook that spoke both would hide
 * more than the lines it saved.
 */

import { useState } from 'react'

import { uiLabels } from './labels'
import { useStore } from '../store/useStore'

type ReadResult = { ok: true; text: string } | { ok: false; error: string }
type WriteResult = { ok: boolean; error?: string }

export interface EditableFile<T> {
  /** The item open in the editor, or null when the list is showing. */
  editing: T | null
  text: string
  setText: (next: string) => void
  /** True once the text differs from what was loaded — nothing else sets it. */
  dirty: boolean
  saving: boolean
  open: (item: T) => Promise<void>
  close: () => void
  save: () => Promise<void>
  /** Close the editor if it is showing this item — for use after a delete. */
  closeIf: (match: (item: T) => boolean) => void
}

export function useEditableFile<T>(opts: {
  read: (item: T) => Promise<ReadResult>
  write: (item: T, text: string) => Promise<WriteResult>
  /** What to call the thing in the "saved" toast. */
  name: (item: T) => string
  /** Called after a successful save: the list shows data from the file. */
  onSaved?: () => void
}): EditableFile<T> {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [editing, setEditing] = useState<T | null>(null)
  const [text, setText] = useState('')
  const [original, setOriginal] = useState('')
  const [saving, setSaving] = useState(false)

  return {
    editing,
    text,
    setText,
    dirty: text !== original,
    saving,
    close: () => setEditing(null),
    closeIf: (match) => setEditing((cur) => (cur !== null && match(cur) ? null : cur)),
    open: async (item) => {
      const r = await opts.read(item)
      if (!r.ok) {
        toast({ kind: 'error', title: labels.skillsSaveFailed, detail: r.error })
        return
      }
      setText(r.text)
      setOriginal(r.text)
      setEditing(item)
    },
    save: async () => {
      if (editing === null) return
      setSaving(true)
      try {
        const r = await opts.write(editing, text)
        if (!r.ok) {
          toast({ kind: 'error', title: labels.skillsSaveFailed, detail: r.error })
          return
        }
        setOriginal(text)
        toast({
          kind: 'success',
          title: labels.skillsSaved(opts.name(editing)),
          detail: labels.skillsSavedDetail,
        })
        opts.onSaved?.()
      } finally {
        setSaving(false)
      }
    },
  }
}
