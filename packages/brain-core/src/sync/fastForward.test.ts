import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { applyFile } from './receive.js'

/**
 * A file that is merely behind is not a file in dispute.
 *
 * Without a remembered base, "the two sides differ" is the only fact available,
 * so keep-both refuses to overwrite and writes `X-2.md` instead. That is right
 * when both sides edited. It is wrong when only the peer did — and it is how a
 * file goes stale permanently: this vault's USER.md held its July content for
 * six weeks while three byte-identical copies accumulated beside it, because
 * nothing was allowed to replace it.
 *
 * The base makes the difference sayable: local bytes still equal to what the
 * two sides last agreed means this machine has not touched the file.
 */
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')

let root = ''

afterEach(() => {
  try {
    rmSync(root, { recursive: true, force: true })
  } catch {
    /* the temp dir is the OS's problem after this */
  }
})

function vault(local: string): { root: string; rel: string } {
  root = mkdtempSync(join(tmpdir(), 'pomnia-ff-'))
  mkdirSync(join(root, 'notes'), { recursive: true })
  writeFileSync(join(root, 'notes', 'a.md'), local, 'utf8')
  return { root, rel: 'notes/a.md' }
}

describe('applyFile with a remembered base', () => {
  it('takes the incoming version when local is still at the agreed state', async () => {
    const agreed = 'wersja uzgodniona\n'
    const { root: v, rel } = vault(agreed)
    const incoming = Buffer.from('wersja nowsza z serwera\n', 'utf8')

    const r = await applyFile({
      vaultRoot: v,
      path: rel,
      content: incoming,
      sha256: sha(incoming),
      baseSha: sha(agreed),
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.fastForward).toBe(true)
      expect(r.conflict).toBeUndefined()
      expect(r.path).toBe(rel)
    }
    expect(readFileSync(join(v, rel), 'utf8')).toBe('wersja nowsza z serwera\n')
  })

  it('still keeps both when this machine changed the file too', async () => {
    const { root: v, rel } = vault('moja zmiana lokalna\n')
    const incoming = Buffer.from('zmiana z serwera\n', 'utf8')

    const r = await applyFile({
      vaultRoot: v,
      path: rel,
      content: incoming,
      sha256: sha(incoming),
      // Agreed on something neither side now holds: a real disagreement.
      baseSha: sha('wersja uzgodniona\n'),
    })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.fastForward).toBeUndefined()
      expect(r.conflict).toEqual({ kept: rel, wrote: 'notes/a-2.md' })
    }
    // The local edit survives untouched — that is the whole point of keep-both.
    expect(readFileSync(join(v, rel), 'utf8')).toBe('moja zmiana lokalna\n')
    expect(readFileSync(join(v, 'notes', 'a-2.md'), 'utf8')).toBe('zmiana z serwera\n')
  })

  it('falls back to keep-both when no base is remembered', async () => {
    const { root: v, rel } = vault('cokolwiek\n')
    const incoming = Buffer.from('co innego\n', 'utf8')

    const r = await applyFile({ vaultRoot: v, path: rel, content: incoming, sha256: sha(incoming) })

    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.fastForward).toBeUndefined()
      expect(r.conflict?.wrote).toBe('notes/a-2.md')
    }
    expect(readFileSync(join(v, rel), 'utf8')).toBe('cokolwiek\n')
  })
})
