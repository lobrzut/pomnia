import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyFile } from './receive.js'

let vaultRoot = ''
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

beforeEach(async () => {
  vaultRoot = await mkdtemp(join(tmpdir(), 'pomnia-crlf-'))
})
afterEach(async () => {
  await rm(vaultRoot, { recursive: true, force: true })
})

const send = (path: string, text: string) => {
  const content = Buffer.from(text, 'utf8')
  return applyFile({ vaultRoot, path, content, sha256: sha(content) })
}

describe('sync — CRLF is not a conflict', () => {
  it('treats the same note with different line endings as unchanged', async () => {
    // The real incident: a Windows desktop and a Linux server disagreed about
    // CR, so every file either had rewritten came back a conflict — and
    // conflicts accumulate. One vault reached 36 copies, 24 of them
    // byte-identical to the file they were conflicting with.
    await send('sessions/n.md', '# note\nline two\n')
    const r = await send('sessions/n.md', '# note\r\nline two\r\n')
    expect(r).toMatchObject({ ok: true, unchanged: true })
  })

  it('writes no conflict copy for that case', async () => {
    await send('sessions/n.md', '# note\nline two\n')
    await send('sessions/n.md', '# note\r\nline two\r\n')
    await expect(readFile(join(vaultRoot, 'sessions', 'n-2.md'))).rejects.toThrow()
  })

  it('leaves the bytes already on disk alone', async () => {
    // Deciding "same" must not become licence to rewrite the file: the receiver
    // keeps what it had, byte for byte.
    await send('sessions/n.md', '# note\nline two\n')
    await send('sessions/n.md', '# note\r\nline two\r\n')
    const onDisk = await readFile(join(vaultRoot, 'sessions', 'n.md'))
    expect(onDisk.toString('utf8')).toBe('# note\nline two\n')
  })

  it('still conflicts when the text really differs', async () => {
    await send('sessions/n.md', '# note\nline two\n')
    const r = await send('sessions/n.md', '# note\r\nline THREE\r\n')
    expect(r).toMatchObject({ ok: true, path: 'sessions/n-2.md' })
  })

  it('still stores a new file normally', async () => {
    const r = await send('sessions/fresh.md', '# fresh\r\n')
    expect(r).toMatchObject({ ok: true, path: 'sessions/fresh.md' })
    expect(r).not.toMatchObject({ unchanged: true })
  })
})
