// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Turning a book into a skill, on the screen where things are brought in.
 *
 * It first shipped on the Skills page, which was the wrong room: Skills is a
 * list of what you already have, and this is an act of import — you pick a
 * file from disk and something new comes out. It now lives with the other
 * imports, in Mini's "Do Pomnia" and the desktop's Import, and the two share
 * this component so they cannot drift into two different cards.
 *
 * The category field is spelled out rather than left as a bare box holding the
 * word "general". Asked what to type into it, the honest answer was that the
 * field never said — a placeholder is not a label, and "general" reads as a
 * setting you must get right rather than a folder name you may invent.
 */

import { useRef, useState } from 'react'
import { BookUp } from 'lucide-react'

import { Button, GlassCard, Spinner } from './ui'
import { Hint } from './Hint'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

/** Where the skill is written when the field is left empty. */
const DEFAULT_CATEGORY = 'general'

export function BookSkillCard({
  remote = false,
  onCreated,
  className,
}: {
  /** Mini holds no vault, so its book goes to the server instead of to disk. */
  remote?: boolean
  onCreated?: () => void
  className?: string
}) {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const unsub = useRef<(() => void) | null>(null)

  async function run(): Promise<void> {
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
      const dir = category.trim() || DEFAULT_CATEGORY
      const r = remote
        ? await api.skillsFromBookRemote(file, dir)
        : await api.skillsFromBook(file, dir)
      if (!r.ok) {
        toast({ kind: 'error', title: labels.bookSkillFailed, detail: r.error })
        return
      }
      toast({
        kind: 'success',
        title: labels.bookSkillDone(r.slug, r.chapters),
        detail: r.warnings.length > 0 ? r.warnings.join(' · ') : r.path,
      })
      onCreated?.()
    } finally {
      unsub.current?.()
      unsub.current = null
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <GlassCard className={className ?? 'mb-5 p-5'}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-sm font-semibold text-ink">{labels.bookSkillTitle}</span>
            <Hint text={labels.bookSkillLead} />
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">{progress ?? labels.bookSkillNote}</p>
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-dim">
            {labels.bookSkillCategory}
            <Hint text={labels.bookSkillCategoryHint} />
          </div>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={DEFAULT_CATEGORY}
            spellCheck={false}
            disabled={busy}
            aria-label={labels.bookSkillCategory}
            className="no-drag w-36 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint"
          />
        </div>
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <BookUp className="h-3.5 w-3.5" />}
          {labels.bookSkillPick}
        </Button>
      </div>
    </GlassCard>
  )
}
