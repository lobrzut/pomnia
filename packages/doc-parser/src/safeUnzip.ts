// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Bounded ZIP inflate for import paths (chat exports + EPUB).
 *
 * Rejects archives before / during inflate when compressed size, entry count,
 * declared uncompressed size, or actual inflated bytes exceed limits — so a
 * zip bomb cannot expand without bound in the main process (F15).
 */
import { unzipSync, type UnzipFileInfo, type Unzipped } from 'fflate'

/** Defaults sized for large legitimate ChatGPT/Claude exports and EPUBs. */
export const ZIP_EXPANSION_LIMITS = {
  /** Compressed archive size (bytes on disk / in memory before inflate). */
  maxCompressedBytes: 512 * 1024 * 1024,
  /** Central-directory entry count (files + directories). */
  maxEntries: 50_000,
  /** Sum of declared originalSize values across entries we would extract. */
  maxTotalUncompressedBytes: 1024 * 1024 * 1024,
  /** Single entry originalSize / actual inflated length. */
  maxSingleEntryBytes: 512 * 1024 * 1024,
} as const

export type ZipExpansionLimits = {
  maxCompressedBytes?: number
  maxEntries?: number
  maxTotalUncompressedBytes?: number
  maxSingleEntryBytes?: number
  /**
   * Optional name filter. Returning false skips that entry (does not count its
   * bytes toward the total). Throwing aborts the whole archive with no partial
   * result returned to the caller.
   */
  filter?: (file: UnzipFileInfo) => boolean
}

export class ZipExpansionError extends Error {
  readonly code = 'ZIP_EXPANSION_LIMIT' as const
  constructor(message: string) {
    super(message)
    this.name = 'ZipExpansionError'
  }
}

function limitsOf(opts?: ZipExpansionLimits) {
  return {
    maxCompressedBytes: opts?.maxCompressedBytes ?? ZIP_EXPANSION_LIMITS.maxCompressedBytes,
    maxEntries: opts?.maxEntries ?? ZIP_EXPANSION_LIMITS.maxEntries,
    maxTotalUncompressedBytes:
      opts?.maxTotalUncompressedBytes ?? ZIP_EXPANSION_LIMITS.maxTotalUncompressedBytes,
    maxSingleEntryBytes: opts?.maxSingleEntryBytes ?? ZIP_EXPANSION_LIMITS.maxSingleEntryBytes,
    filter: opts?.filter,
  }
}

/**
 * Inflate a ZIP with hard caps. On limit breach throws {@link ZipExpansionError}
 * and does not return a partial map (fflate may have allocated briefly; callers
 * must not write vault state after this throw).
 */
export function unzipBounded(data: Uint8Array, opts?: ZipExpansionLimits): Unzipped {
  const lim = limitsOf(opts)
  if (data.byteLength > lim.maxCompressedBytes) {
    throw new ZipExpansionError(
      `Archive is too large (${data.byteLength} bytes compressed; limit ${lim.maxCompressedBytes}).`,
    )
  }

  let seenEntries = 0
  let declaredTotal = 0

  let files: Unzipped
  try {
    files = unzipSync(data, {
      filter: (file) => {
        seenEntries++
        if (seenEntries > lim.maxEntries) {
          throw new ZipExpansionError(
            `Archive has too many entries (limit ${lim.maxEntries}).`,
          )
        }
        if (opts?.filter && !opts.filter(file)) return false

        const original = file.originalSize >>> 0
        if (original > lim.maxSingleEntryBytes) {
          throw new ZipExpansionError(
            `Archive entry "${file.name}" declares ${original} uncompressed bytes (limit ${lim.maxSingleEntryBytes}).`,
          )
        }
        declaredTotal += original
        if (declaredTotal > lim.maxTotalUncompressedBytes) {
          throw new ZipExpansionError(
            `Archive uncompressed size exceeds limit (${lim.maxTotalUncompressedBytes} bytes).`,
          )
        }
        return true
      },
    })
  } catch (e) {
    if (e instanceof ZipExpansionError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new ZipExpansionError(`Archive could not be read: ${msg}`)
  }

  let actualTotal = 0
  for (const [name, bytes] of Object.entries(files)) {
    const n = bytes.byteLength
    if (n > lim.maxSingleEntryBytes) {
      throw new ZipExpansionError(
        `Archive entry "${name}" inflated to ${n} bytes (limit ${lim.maxSingleEntryBytes}).`,
      )
    }
    actualTotal += n
    if (actualTotal > lim.maxTotalUncompressedBytes) {
      throw new ZipExpansionError(
        `Archive inflated size exceeds limit (${lim.maxTotalUncompressedBytes} bytes).`,
      )
    }
  }

  return files
}
