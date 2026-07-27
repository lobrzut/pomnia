// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { api } from './api'

/** Resolve a filesystem path from a drag-dropped File (Electron preload webUtils). */
export function pathFromDroppedFile(file: File): string | null {
  try {
    const path = api.getPathForFile(file)
    return path || null
  } catch {
    const legacy = (file as File & { path?: string }).path
    return legacy || null
  }
}
