// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Tiny structured logger shared by engine + CLI. Honors POMNIA_DEBUG (legacy: RELIQUA_DEBUG). */

import { writeFileLog } from './logFile.js'

type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const min: Level = process.env.POMNIA_DEBUG || process.env.RELIQUA_DEBUG ? 'debug' : 'info'

let sink: ((level: Level, msg: string) => void) | null = null
const extraSinks: Array<(level: Level, msg: string) => void> = []

/** Allow the host (Electron main / CLI) to capture log lines for the UI. */
export function setLogSink(fn: ((level: Level, msg: string) => void) | null): void {
  sink = fn
}

/** Additional sinks (e.g. daily log file) — does not replace setLogSink. */
export function addLogSink(fn: (level: Level, msg: string) => void): () => void {
  extraSinks.push(fn)
  return () => {
    const i = extraSinks.indexOf(fn)
    if (i >= 0) extraSinks.splice(i, 1)
  }
}

function emit(level: Level, args: unknown[]): void {
  if (order[level] < order[min]) return
  const msg = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
  const line = `[pomnia] ${level.toUpperCase()} ${msg}`
  writeFileLog(level, msg)
  for (const s of extraSinks) s(level, msg)
  if (sink) sink(level, msg)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  debug: (...a: unknown[]) => emit('debug', a),
  info: (...a: unknown[]) => emit('info', a),
  warn: (...a: unknown[]) => emit('warn', a),
  error: (...a: unknown[]) => emit('error', a)
}
