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

    // The append is fire-and-forget, so a fixed 50 ms sleep is a bet on how
    // busy the machine is — and under the full suite it loses: the first line
    // lands, the second has not been flushed yet, and the run fails on a file
    // nothing is wrong with. Wait for the content instead of for the clock.
    const day = new Date().toISOString().slice(0, 10)
    const file = join(dir, `pomnia-${day}.log`)
    let text = ''
    for (let i = 0; i < 100 && !/WARN pending index/.test(text); i++) {
      await new Promise((r) => setTimeout(r, 20))
      text = await readFile(file, 'utf8').catch(() => '')
    }

    expect(await readdir(dir)).toContain(`pomnia-${day}.log`)
    expect(text).toMatch(/INFO hello vault/)
    expect(text).toMatch(/WARN pending index/)
  })
})
