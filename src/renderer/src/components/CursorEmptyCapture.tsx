// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { MessagesSquare } from 'lucide-react'
import { Button } from './ui'
import { uiLabels } from '../lib/labels'
import type { CursorEmptyListReason } from '@core/cursorEmptyCapture'

/**
 * Empty state for a Cursor backup that sealed 0 conversations.
 * Same dashed card as the Chats empty list and the Import drop result.
 */
export function CursorEmptyCapture({
  reason,
  onImport,
}: {
  /** `file` — someone dropped state.vscdb on Import. The other two are live backup results. */
  reason: CursorEmptyListReason | 'file'
  /** Opens the Import tab. Omitted when the user is already there. */
  onImport?: () => void
}) {
  const labels = uiLabels()
  const detail =
    reason === 'file'
      ? labels.cursorEmptyCaptureFile
      : reason === 'db-too-large'
        ? labels.cursorEmptyCaptureDetail
        : labels.cursorEmptyCaptureUnknown
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
      <MessagesSquare className="h-6 w-6 text-ink-faint" />
      <p className="text-sm font-medium text-ink">{labels.cursorEmptyCaptureTitle}</p>
      <p className="max-w-md text-xs leading-relaxed text-ink-dim">{detail}</p>
      <p className="max-w-md text-[11px] leading-relaxed text-ink-faint">{labels.cursorEmptyCaptureNext}</p>
      {onImport && (
        <Button onClick={onImport} className="mt-1">
          {labels.cursorEmptyCaptureAction}
        </Button>
      )}
    </div>
  )
}
