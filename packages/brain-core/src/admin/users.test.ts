import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  authenticate,
  changePassword,
  createUser,
  deleteUser,
  hashPassword,
  readUsers,
  summariseUser,
  touchLogin,
  usersPath,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './users.js'

let dir: string
const GOOD = 'correct horse battery staple'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pomnia-users-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('hashing', () => {
  it('round-trips', async () => {
    const h = await hashPassword(GOOD)
    expect(await verifyPassword(GOOD, h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })

  it('never stores the password', async () => {
    const h = await hashPassword(GOOD)
    expect(h).not.toContain(GOOD)
    expect(h.startsWith('scrypt$')).toBe(true)
  })

  it('salts, so two identical passwords hash differently', async () => {
    expect(await hashPassword(GOOD)).not.toBe(await hashPassword(GOOD))
  })

  /** Unicode normalisation: the same characters typed on another keyboard. */
  it('accepts an equivalent unicode form', async () => {
    const h = await hashPassword('zażółć gęślą jaźń'.normalize('NFD'))
    expect(await verifyPassword('zażółć gęślą jaźń'.normalize('NFC'), h)).toBe(true)
  })

  it('rejects a malformed hash instead of throwing', async () => {
    for (const bad of ['', 'nonsense', 'scrypt$x$y$z', 'bcrypt$1$2$3$4$5']) {
      expect(await verifyPassword(GOOD, bad)).toBe(false)
    }
  })

  /** A hostile users.json must not be able to hang the process per login. */
  it('refuses absurd scrypt parameters rather than running them', async () => {
    const bomb = ['scrypt', 1 << 25, 64, 32, 'c2FsdA', 'aGFzaA'].join('$')
    const t0 = Date.now()
    expect(await verifyPassword(GOOD, bomb)).toBe(false)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('validation', () => {
  it('accepts ordinary logins and lowercases them', () => {
    expect(validateUsername('Helluk')).toEqual({ ok: true, username: 'helluk' })
    expect(validateUsername('ops-2')).toEqual({ ok: true, username: 'ops-2' })
  })

  it('refuses logins that would be ambiguous or unusable', () => {
    for (const n of ['', 'a', 'x'.repeat(40), 'a b', 'a/b', 'ąę']) {
      expect(validateUsername(n).ok, n).toBe(false)
    }
  })

  /** Length over composition: rules produce `Password1!` and a sticky note. */
  it('requires twelve characters and nothing else', () => {
    expect(validatePassword('short').ok).toBe(false)
    expect(validatePassword('123456789012').ok).toBe(true)
    expect(validatePassword('x'.repeat(300)).ok).toBe(false)
  })
})

describe('createUser', () => {
  it('creates and stores an admin', async () => {
    const r = await createUser(dir, { username: 'helluk', password: GOOD, role: 'admin' })
    expect(r.ok).toBe(true)
    const users = await readUsers(dir)
    expect(users).toHaveLength(1)
    expect(users[0].role).toBe('admin')
  })

  it('refuses a duplicate, case-insensitively', async () => {
    await createUser(dir, { username: 'Helluk', password: GOOD, role: 'admin' })
    expect((await createUser(dir, { username: 'helluk', password: GOOD, role: 'admin' })).ok).toBe(false)
    expect(await readUsers(dir)).toHaveLength(1)
  })

  it('refuses a weak password before writing anything', async () => {
    expect((await createUser(dir, { username: 'a1', password: 'short', role: 'admin' })).ok).toBe(false)
    expect(await readUsers(dir)).toHaveLength(0)
  })

  it('writes 0600', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    if (process.platform !== 'win32') {
      const st = await import('node:fs').then((m) => m.promises.stat(usersPath(dir)))
      expect(st.mode & 0o777).toBe(0o600)
    }
  })
})

describe('authenticate', () => {
  beforeEach(async () => {
    await createUser(dir, { username: 'helluk', password: GOOD, role: 'admin' })
  })

  it('accepts the right password', async () => {
    const r = await authenticate(dir, 'helluk', GOOD)
    expect(r.ok).toBe(true)
  })

  it('is case-insensitive on the login, not on the password', async () => {
    expect((await authenticate(dir, 'HELLUK', GOOD)).ok).toBe(true)
    expect((await authenticate(dir, 'helluk', GOOD.toUpperCase())).ok).toBe(false)
  })

  it('rejects a wrong password and an unknown user alike', async () => {
    expect((await authenticate(dir, 'helluk', 'nope')).ok).toBe(false)
    expect((await authenticate(dir, 'ghost', GOOD)).ok).toBe(false)
  })

  /**
   * Returning early for an unknown user would let an attacker separate "no
   * such account" from "wrong password" by timing, turning one guess into a
   * username oracle.
   */
  it('costs the same for an unknown user as for a wrong password', async () => {
    const time = async (u: string, p: string): Promise<number> => {
      const t0 = process.hrtime.bigint()
      await authenticate(dir, u, p)
      return Number(process.hrtime.bigint() - t0) / 1e6
    }
    const unknown = await time('ghost', GOOD)
    const wrong = await time('helluk', 'nope')
    // Both do one scrypt. Generous bound — this asserts "same order of
    // magnitude", not a precise timing guarantee on a shared CI box.
    expect(Math.max(unknown, wrong) / Math.max(1, Math.min(unknown, wrong))).toBeLessThan(4)
  })

  it('denies everyone when the file is corrupt, rather than anyone', async () => {
    await writeFile(usersPath(dir), '{ not json', 'utf8')
    expect((await authenticate(dir, 'helluk', GOOD)).ok).toBe(false)
  })
})

describe('changePassword', () => {
  it('invalidates the old one', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    await changePassword(dir, 'a1', 'a different long password')
    expect((await authenticate(dir, 'a1', GOOD)).ok).toBe(false)
    expect((await authenticate(dir, 'a1', 'a different long password')).ok).toBe(true)
  })

  it('refuses a weak replacement and leaves the old one working', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    expect((await changePassword(dir, 'a1', 'short')).ok).toBe(false)
    expect((await authenticate(dir, 'a1', GOOD)).ok).toBe(true)
  })
})

describe('deleteUser', () => {
  it('refuses to remove the last admin', async () => {
    await createUser(dir, { username: 'only', password: GOOD, role: 'admin' })
    expect((await deleteUser(dir, 'only')).ok).toBe(false)
    expect(await readUsers(dir)).toHaveLength(1)
  })

  it('removes one once a second admin exists', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    await createUser(dir, { username: 'a2', password: GOOD, role: 'admin' })
    expect((await deleteUser(dir, 'a1')).ok).toBe(true)
  })
})

describe('summariseUser', () => {
  it('never carries the hash', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    const u = (await readUsers(dir))[0]
    expect(JSON.stringify(summariseUser(u))).not.toContain('scrypt$')
  })
})

describe('touchLogin', () => {
  it('records the last login', async () => {
    await createUser(dir, { username: 'a1', password: GOOD, role: 'admin' })
    await touchLogin(dir, 'a1')
    expect((await readUsers(dir))[0].lastLogin).toBeTruthy()
  })
})
