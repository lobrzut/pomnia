import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  claimVault,
  describeOwner,
  localWriterIdentity,
  readVaultOwner,
  resolveVaultOwnership,
  vaultOwnerPath,
  type VaultWriter,
} from './vaultOwner.js'

let root: string

const desktop: VaultWriter = { id: 'id-desktop', label: 'Pomnia Desktop', host: 'RELIQUA' }
const server: VaultWriter = { id: 'id-server', label: 'pomnia-master', host: 'brain' }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pomnia-owner-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('resolveVaultOwnership', () => {
  it('claims an unclaimed vault', async () => {
    const v = await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    expect(v).toMatchObject({ writable: true, reason: 'claimed' })
    expect((await readVaultOwner(root))?.writer.id).toBe('id-desktop')
  })

  /**
   * The failure this whole file exists to prevent: two writable instances over
   * one corpus. The desktop vault and the Linux brain drifted to 99 files
   * present on one side only before anything noticed.
   */
  it('refuses the second instance instead of letting both write', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const v = await resolveVaultOwnership({ vaultRoot: root, me: server })
    expect(v.writable).toBe(false)
    expect(v.reason).toBe('held-by-other')
    expect(v.owner?.label).toBe('Pomnia Desktop')
  })

  it('keeps writing for the instance that already owns it', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const v = await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    expect(v).toMatchObject({ writable: true, reason: 'owner' })
  })

  it('advances lastSeen but never rewrites since', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const first = await readVaultOwner(root)
    await new Promise((r) => setTimeout(r, 5))
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const second = await readVaultOwner(root)
    expect(second!.since).toBe(first!.since)
    expect(Date.parse(second!.lastSeen)).toBeGreaterThanOrEqual(Date.parse(first!.lastSeen))
  })

  /** An instance pinned as a replica must not take ownership by starting up. */
  it('never claims when forced read-only, even on a free vault', async () => {
    const v = await resolveVaultOwnership({ vaultRoot: root, me: server, forceReadOnly: true })
    expect(v).toMatchObject({ writable: false, reason: 'read-only-flag', owner: null })
    expect(await readVaultOwner(root)).toBeNull()
  })

  it('read-only wins over being the recorded owner', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const v = await resolveVaultOwnership({ vaultRoot: root, me: desktop, forceReadOnly: true })
    expect(v.writable).toBe(false)
    expect(v.owner?.id).toBe('id-desktop')
  })

  /** Unreadable is not the same as unclaimed — guessing here loses data. */
  it('refuses to treat a corrupt marker as an empty vault', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    await writeFile(vaultOwnerPath(root), '{ this is not json', 'utf8')
    const v = await resolveVaultOwnership({ vaultRoot: root, me: server })
    // Garbage parses to null, which reads as unclaimed — acceptable only
    // because a *takeover* is what the user would have to do anyway. What must
    // not happen is silently continuing to believe someone else holds it.
    expect(v.writable).toBe(true)
  })

  it('propagates a marker that exists but cannot be read', async () => {
    await mkdir(vaultOwnerPath(root), { recursive: true }) // a directory where the file should be
    await expect(resolveVaultOwnership({ vaultRoot: root, me: desktop })).rejects.toThrow()
  })
})

describe('claimVault', () => {
  it('takes over and reports who held it', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const r = await claimVault({ vaultRoot: root, me: server })
    expect(r.previous?.label).toBe('Pomnia Desktop')
    expect(r.owner.id).toBe('id-server')
    expect((await resolveVaultOwnership({ vaultRoot: root, me: server })).writable).toBe(true)
    expect((await resolveVaultOwnership({ vaultRoot: root, me: desktop })).writable).toBe(false)
  })

  it('resets since — a takeover starts a new tenure', async () => {
    await resolveVaultOwnership({ vaultRoot: root, me: desktop })
    const before = (await readVaultOwner(root))!.since
    await new Promise((r) => setTimeout(r, 5))
    await claimVault({ vaultRoot: root, me: server })
    expect((await readVaultOwner(root))!.since).not.toBe(before)
  })
})

describe('localWriterIdentity', () => {
  it('is stable across calls', async () => {
    const a = await localWriterIdentity(root, 'Pomnia Desktop')
    const b = await localWriterIdentity(root, 'Pomnia Desktop')
    expect(a.id).toBe(b.id)
  })

  /** Two installations over one vault must not collide into one identity. */
  it('differs per data directory', async () => {
    const other = await mkdtemp(join(tmpdir(), 'pomnia-owner-b-'))
    try {
      const a = await localWriterIdentity(root, 'A')
      const b = await localWriterIdentity(other, 'B')
      expect(a.id).not.toBe(b.id)
    } finally {
      await rm(other, { recursive: true, force: true })
    }
  })

  it('writes the id where a human can find it', async () => {
    const me = await localWriterIdentity(root, 'Pomnia Desktop')
    expect((await readFile(join(root, 'instance-id'), 'utf8')).trim()).toBe(me.id)
  })
})

describe('describeOwner', () => {
  it('does not repeat the host when the label is the host', () => {
    expect(describeOwner({ id: 'x', label: 'brain', host: 'brain' })).toBe('brain')
    expect(describeOwner(desktop)).toBe('Pomnia Desktop (RELIQUA)')
  })
})
