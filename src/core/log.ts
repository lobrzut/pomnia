/** Tiny structured logger shared by engine + CLI. Honors RELIQUA_DEBUG. */

type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const min: Level = process.env.RELIQUA_DEBUG ? 'debug' : 'info'

let sink: ((level: Level, msg: string) => void) | null = null

/** Allow the host (Electron main / CLI) to capture log lines for the UI. */
export function setLogSink(fn: ((level: Level, msg: string) => void) | null): void {
  sink = fn
}

function emit(level: Level, args: unknown[]): void {
  if (order[level] < order[min]) return
  const msg = args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
  const line = `[reliqua] ${level.toUpperCase()} ${msg}`
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
