// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Editing one of the markdown files the user owns — a skill, or a prompt.
 *
 * Mini had this and the full app did not. The full app's answer to "edit a
 * skill" was to hand the file to whatever the operating system opens .md with,
 * which is defensible on a machine you own and impossible in Mini, where the
 * file lives on a server. So the same act had two different answers depending
 * on which build you happened to be running, and only one of them let you fix
 * a typo without leaving the app. This is Mini's editor, extracted, so both
 * builds mean the same thing by it.
 *
 * A plain textarea on purpose. These are markdown files that a server serves
 * and an agent reads; an editor that prettifies on save would rewrite lines
 * nobody touched, and the diff would be the app's opinion rather than the
 * user's edit.
 */

import { Save } from 'lucide-react'

import { Button, GlassCard, Spinner } from './ui'
import { uiLabels } from '../lib/labels'

export function MarkdownEditor({
  title,
  subtitle,
  text,
  onChange,
  onClose,
  onSave,
  saveLabel,
  saving = false,
  dirty,
}: {
  title: string
  /** The path, usually — where this file actually is. */
  subtitle?: string
  text: string
  onChange: (next: string) => void
  onClose: () => void
  onSave: () => void
  /** Where the save lands: Mini says "to the server", the full app "to the vault". */
  saveLabel?: string
  saving?: boolean
  dirty: boolean
}) {
  const labels = uiLabels()
  return (
    <GlassCard className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{title}</div>
          {subtitle && (
            <div className="truncate font-mono text-[11px] text-ink-faint">{subtitle}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="soft" onClick={onClose}>
            {labels.skillsBackToList}
          </Button>
          {/* Disabled while unchanged: a save button that is always live
              invites a write that has nothing to write. */}
          <Button onClick={onSave} disabled={saving || !dirty}>
            {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saveLabel ?? labels.skillsSave}
          </Button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        aria-label={title}
        className="no-drag h-[46vh] w-full resize-y rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[12px] leading-relaxed text-ink"
      />
      <p className="mt-2 text-[11px] text-ink-faint">
        {dirty ? labels.skillsDirty : labels.skillsSavedHint}
      </p>
    </GlassCard>
  )
}
