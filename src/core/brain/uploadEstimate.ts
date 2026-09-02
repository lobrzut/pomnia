// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * How long the next upload will take, when that can honestly be said.
 *
 * A progress bar that starts at a guess is worse than no estimate: the guess is
 * wrong by whatever the link happens to be — a gigabit LAN and a hotel wifi are
 * three orders of magnitude apart — and the number is believed anyway because
 * it is printed with a unit.
 *
 * So nothing is estimated until something has been measured. The first upload
 * shows a size and says the time is not known yet; it records what it actually
 * achieved, and every upload after it is estimated from that. The rate is
 * smoothed rather than replaced, because one send over a saturated link should
 * not throw away everything learned before it.
 */

/** Below this, the sample is mostly handshake and says nothing about the link. */
const MIN_SAMPLE_BYTES = 64 * 1024
const MIN_SAMPLE_MS = 200
/** Weight of the newest sample. Low enough that one bad send does not dominate. */
const SMOOTHING = 0.4

export interface UploadRate {
  /** Bytes per second, smoothed across previous sends. */
  bytesPerSec: number
  /** How many sends fed it — shown so a single sample is not read as settled. */
  samples: number
}

/**
 * Fold one completed upload into the running rate.
 *
 * Returns the previous rate unchanged when the sample is too small to mean
 * anything: a 3 kB send finishing in 40 ms would imply 75 MB/s, which is a
 * statement about the handshake, not the link.
 */
export function recordUpload(
  prev: UploadRate | null,
  bytes: number,
  elapsedMs: number,
): UploadRate | null {
  if (bytes < MIN_SAMPLE_BYTES || elapsedMs < MIN_SAMPLE_MS) return prev
  const observed = (bytes / elapsedMs) * 1000
  if (!Number.isFinite(observed) || observed <= 0) return prev
  if (!prev) return { bytesPerSec: observed, samples: 1 }
  return {
    bytesPerSec: prev.bytesPerSec * (1 - SMOOTHING) + observed * SMOOTHING,
    samples: prev.samples + 1,
  }
}

/** Seconds the next upload should take, or null when nothing has been measured. */
export function estimateSeconds(bytes: number, rate: UploadRate | null): number | null {
  if (!rate || rate.bytesPerSec <= 0 || bytes <= 0) return null
  return bytes / rate.bytesPerSec
}

/** `812 B`, `41,3 kB`, `12,4 MB` — the unit a person would have used. */
export function formatBytes(bytes: number, locale = 'pl'): string {
  const n = (v: number, digits: number): string =>
    v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${n(bytes / 1024, 1)} kB`
  return `${n(bytes / (1024 * 1024), 1)} MB`
}

/**
 * A duration nobody has to convert in their head.
 *
 * Rounded up, never to zero: "0 s" for work that is about to happen reads as
 * "nothing to do". Anything under five seconds is not worth a number at all.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 5) return '< 5 s'
  if (seconds < 60) return `${Math.ceil(seconds)} s`
  const mins = Math.floor(seconds / 60)
  const rest = Math.ceil(seconds % 60)
  if (mins < 60) return rest === 0 ? `${mins} min` : `${mins} min ${rest} s`
  const hours = Math.floor(mins / 60)
  return `${hours} h ${mins % 60} min`
}
