// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  atomicWrite,
  writeFileKeepingPrev,
  writeFileKeepingPrevSync,
} from './durableWrite.js'
import { createToken, readTokens } from '../admin/tokens.js'

describe('durableWrite (F19)', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pomnia-durable-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps a .prev spare and uses unique tmp names', async () => {
    const file = join(dir, 'note.md')
    await writeFileKeepingPrev(file, Buffer.from('v1'))
    await writeFileKeepingPrev(file, Buffer.from('v2'))
    expect(await readFile(file, 'utf8')).toBe('v2')
    expect(await readFile(`${file}.prev`, 'utf8')).toBe('v1')
  })

  it('creates credential files with mode 0600', async () => {
    const file = join(dir, 'secret.json')
    await atomicWrite(file, Buffer.from('[]\n'), { mode: 0o600 })
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
  })

  it('sync path keeps .prev for library-style writers', () => {
    const file = join(dir, 'skill.md')
    writeFileKeepingPrevSync(file, Buffer.from('a'))
    writeFileKeepingPrevSync(file, Buffer.from('b'))
    expect(readFileSync(file, 'utf8')).toBe('b')
    expect(readFileSync(`${file}.prev`, 'utf8')).toBe('a')
  })

  it('token store leaves a recoverable .prev after mutation', async () => {
    const file = join(dir, 'mcp-tokens.json')
    await createToken(file, { name: 'first', role: 'admin' })
    await createToken(file, { name: 'second', role: 'agent' })
    expect((await readTokens(file)).map((t) => t.name)).toEqual(['first', 'second'])
    const prev = JSON.parse(await readFile(`${file}.prev`, 'utf8')) as Array<{ name: string }>
    expect(prev.map((t) => t.name)).toEqual(['first'])
  })
})
