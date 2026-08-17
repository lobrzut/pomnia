import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Vault } from '../vault.js'

/**
 * Reproduces 17 August 2026.
 *
 * A machine lost power during a backup. manifest.cvb came back at its full new
 * length — 55088 bytes — containing nothing but zeros, because the rename that
 * publishes it is a metadata operation the filesystem journals immediately while
 * the bytes were still in the page cache. The vault then refused to open at all,
 * and the message was "bad magic — not a Pomnia blob": an internal format
 * detail, offered as a dead end, over 137 intact snapshots and 1886 notes that
 * were sitting on disk in plain markdown the whole time.
 *
 * Three things had to be true afterwards and none of them were:
 *   the write survives power loss          → atomicWrite fsyncs before renaming
 *   losing it anyway is not fatal          → the previous manifest is kept
 *   losing both says something useful      → the error names what survived
 *
 * The zeroing here is the real failure mode, not an approximation: same length,
 * same all-zero contents, produced the same way the crash produced it.
 */

const PASS = 'test-passphrase-not-a-real-one'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-manifest-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** What a power cut leaves behind: the size lands, the content does not. */
const zeroOut = async (file: string): Promise<void> => {
  const { size } = await stat(file)
  await writeFile(file, Buffer.alloc(size))
}

describe('the vault index survives an interrupted write', () => {
  /**
   * Removing a snapshot that was never there changes nothing and saves the
   * manifest, which is the second write a spare needs to exist. Reaching for a
   * real backup would drag conversation sources into a test about durability.
   */
  const saveAgain = async (): Promise<void> => {
    const v = await Vault.open(dir, PASS)
    await v.removeSnapshot('no-such-snapshot')
  }

  it('keeps the previous manifest beside the current one', async () => {
    await Vault.create(dir, 'Test', PASS)
    const prev = join(dir, 'manifest.cvb.prev')
    await expect(readFile(prev)).rejects.toThrow() // nothing to keep on the first write

    await saveAgain()
    const spare = await readFile(prev)
    expect(spare.subarray(0, 4).toString('ascii')).toBe('CVB1')
  })

  it('opens from the spare when the main copy is zeroed', async () => {
    await Vault.create(dir, 'Test', PASS)
    await saveAgain()

    await zeroOut(join(dir, 'manifest.cvb'))
    const wrecked = await readFile(join(dir, 'manifest.cvb'))
    expect(wrecked.every((b) => b === 0), 'the test did not actually wreck it').toBe(true)

    const reopened = await Vault.open(dir, PASS)
    expect(reopened.getManifest().name).toBe('Test')
  })

  /**
   * The case that actually happened — no spare existed yet. The vault cannot
   * open, and the only thing that matters is whether the person is told where
   * they stand.
   */
  it('says what survived and how to rebuild when both copies are gone', async () => {
    await Vault.create(dir, 'Test', PASS)
    await zeroOut(join(dir, 'manifest.cvb'))
    await rm(join(dir, 'manifest.cvb.prev'), { force: true })

    await expect(Vault.open(dir, PASS)).rejects.toThrow(/damaged/i)
    const err = await Vault.open(dir, PASS).catch((e: Error) => e.message)
    expect(err, 'the error must not be a bare format detail').not.toMatch(/^bad magic/)
    expect(err).toMatch(/repair-vault-manifest/)
    expect(err, 'must say the notes are not lost').toMatch(/not lost|intact/i)
  })

  it('still rejects a wrong passphrase before blaming the manifest', async () => {
    await Vault.create(dir, 'Test', PASS)
    await zeroOut(join(dir, 'manifest.cvb'))
    // Wrong passphrase must fail as a wrong passphrase — a damaged-index message
    // would send someone repairing a vault that is perfectly fine.
    await expect(Vault.open(dir, 'the-wrong-one')).rejects.toThrow(/passphrase/i)
  })
})
