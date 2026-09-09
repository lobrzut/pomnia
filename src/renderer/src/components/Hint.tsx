// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * An explanation you can ask for, instead of one you have to read.
 *
 * Every setting here grew a line of prose under it. Individually each was
 * short — measured across 674 labels, none passed 160 characters and only five
 * passed 90 — but they stack: a settings panel became a wall of grey text in
 * which the actual controls were the minority. The reader pays for all of it
 * every time, to learn something once.
 *
 * So the explanation moves behind a mark next to the thing it explains. The
 * control keeps its name; the reasoning is one hover or one tap away and
 * otherwise costs a single character of space.
 *
 * Not a tooltip library. `title` alone would be enough on a desktop and is
 * invisible on touch, so this renders its own bubble on hover and on click, and
 * keeps `title` as the accessible fallback.
 */

import { useEffect, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import clsx from 'clsx'

export function Hint({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)

  // A bubble opened by click must close when attention moves elsewhere;
  // otherwise it follows the reader around the panel.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <span
      ref={wrap}
      className={clsx('relative inline-flex align-middle', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        title={text}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="no-drag inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-faint transition-colors hover:text-cyan"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        // Left-anchored and width-capped so a long note cannot push the panel
        // wider than the window — the horizontal-overflow bug this app already
        // had once, arriving by a new route.
        <span
          role="tooltip"
          className="pointer-events-none absolute left-0 top-5 z-50 w-64 max-w-[min(16rem,80vw)] rounded-lg border border-white/10 bg-black/90 px-2.5 py-2 text-[11px] leading-snug text-ink shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
