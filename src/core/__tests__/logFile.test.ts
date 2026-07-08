import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initFileLog, writeFileLog } from '../logFile.js'

describe('logFile', () => {
  let dir = ''

  afterEach(async () => {
    initFileLog('')
  })

  it('writes daily rotated log file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'pomnia-log-'))
    initFileLog(dir)
    writeFileLog('info', 'hello vault')
    writeFileLog('warn', 'pending index')
    await new Promise((r) => setTimeout(r, 50))
    const files = await readdir(dir)
    const day = new Date().toISOString().slice(0, 10)
    expect(files).toContain(`pomnia-${day}.log`)
    const text = await readFile(join(dir, `pomnia-${day}.log`), 'utf8')
    expect(text).toMatch(/INFO hello vault/)
    expect(text).toMatch(/WARN pending index/)
  })
})
