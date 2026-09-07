// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * One list, for everything that is a directory of markdown the user owns.
 *
 * Skills and prompts are the same object in different folders: a name, a
 * sentence saying what it is for, a size and a date, and a couple of things
 * you can do to it. The full app's Skills page settled what that should look
 * like; this is that layout, extracted, so Mini's two screens and the desktop
 * prompt library cannot each drift into their own version of it.
 *
 * Deletion is deliberately two clicks rather than a dialog. A dialog for a
 * file you can see, whose name you just read, is ceremony — but a single click
 * that removes something with no undo is a trap. The row arms, says so, and
 * disarms itself after a few seconds if you walk away.
 */

import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import clsx from 'clsx'

import { GlassCard } from './ui'

/** How long an armed delete stays armed before it forgets. */
const ARM_TIMEOUT_MS = 4000

export function ListSection({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count?: number
  /** Shown instead of children when there is nothing in the section. */
  empty?: string
  children?: React.ReactNode
}) {
  const isEmpty = empty !== undefined && (count === 0 || children === undefined)
  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="border-b border-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        {title}
        {count !== undefined && ` · ${count}`}
      </div>
      {isEmpty ? <p className="px-3 py-4 text-xs text-ink-dim">{empty}</p> : children}
    </GlassCard>
  )
}

export interface RowAction {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick: () => void
}

export function ListRow({
  title,
  subtitle,
  meta,
  actions,
  onOpen,
  onDelete,
  deleteLabel,
  confirmLabel,
}: {
  title: string
  subtitle?: string
  /** Short facts under the description — size, date, category. */
  meta?: (string | undefined)[]
  actions?: RowAction[]
  /** Makes the whole row activate; keep it the same as the primary action. */
  onOpen?: () => void
  onDelete?: () => void
  deleteLabel?: string
  confirmLabel?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!armed) return
    timer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [armed])

  const facts = (meta ?? []).filter((m): m is string => Boolean(m))

  return (
    <div
      className={clsx(
        'flex items-start gap-3 border-b border-white/5 px-3 py-2.5 last:border-0',
        onOpen && 'cursor-pointer hover:bg-white/[0.03]',
      )}
      onClick={onOpen ? () => onOpen() : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{title}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-dim">{subtitle || '—'}</p>
        {facts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-ink-faint">
            {facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {(actions ?? []).map((a) => (
          <button
            key={a.label}
            type="button"
            className="no-drag inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-iris hover:bg-white/5 hover:text-cyan"
            onClick={(e) => {
              e.stopPropagation()
              a.onClick()
            }}
          >
            {a.icon && <a.icon className="h-3 w-3" />}
            {a.label}
          </button>
        ))}
        {onDelete && (
          <button
            type="button"
            className={clsx(
              'no-drag inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              armed
                ? 'bg-rose/15 text-rose'
                : 'text-ink-faint hover:bg-white/5 hover:text-rose',
            )}
            onClick={(e) => {
              e.stopPropagation()
              // First click arms and says so; the second is the one that acts.
              if (!armed) {
                setArmed(true)
                return
              }
              setArmed(false)
              onDelete()
            }}
          >
            <Trash2 className="h-3 w-3" />
            {armed ? (confirmLabel ?? 'Confirm') : (deleteLabel ?? 'Delete')}
          </button>
        )}
      </div>
    </div>
  )
}
