/** Append-only daily log files — used by Electron main (not renderer). */

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'

let logDir: string | null = null
let chain = Promise.resolve()

/** Enable writing `[pomnia]` lines to `pomnia-YYYY-MM-DD.log` under `dir`. */
export function initFileLog(dir: string): void {
  logDir = dir
}

function dailyPath(): string | null {
  if (!logDir) return null
  const day = new Date().toISOString().slice(0, 10)
  return join(logDir, `pomnia-${day}.log`)
}

/** Queue a log line (non-blocking; errors are swallowed). */
export function writeFileLog(level: Level, msg: string): void {
  const file = dailyPath()
  if (!file) return
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}\n`
  chain = chain
    .then(async () => {
      await mkdir(logDir!, { recursive: true })
      await appendFile(file, line, 'utf8')
    })
    .catch(() => {})
}
