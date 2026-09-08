// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Panel accounts — people, as opposed to machines.
 *
 * The split matters and is not cosmetic:
 *
 *   users   humans at the panel. Name + password, session cookie.
 *   tokens  agents and scripts. Bearer, no session, no expiry.
 *
 * Conflating them is how you end up either pasting a 47-character secret into
 * a browser every time, or handing an assistant a credential that can log into
 * your admin panel. They have different lifetimes, different theft models and
 * different revocation stories.
 *
 * Hashing is scrypt from `node:crypto`. Not bcrypt or argon2 — those are better
 * primitives, and both are native modules. A self-hosted server that fails to
 * install because a C++ toolchain is missing is worse than one using the
 * memory-hard KDF that ships in the standard library. Parameters below are
 * tuned to ~100 ms on a modest box, which is the usual trade: slow enough that
 * offline guessing hurts, fast enough that a login does not feel broken.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { writeFileKeepingPrev } from '../archive/durableWrite.js'
import type { TokenRole } from '../mcp/auth.js'
import { withStoreLock } from '../storage/storeLock.js'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** N=2^15 ≈ 32 MiB, ~100 ms. maxmem must exceed 128*N*r or scrypt refuses. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const KEYLEN = 32

export interface StoredUser {
  username: string
  /** `scrypt$N$r$p$salt$hash`, all base64url. Self-describing so the cost can
   *  be raised later without invalidating everyone's password. */
  password: string
  role: TokenRole
  created: string
  lastLogin?: string
}

export interface UserSummary {
  username: string
  role: TokenRole
  created: string
  lastLogin?: string
}

export function usersPath(dataDir: string): string {
  return join(dataDir, 'users.json')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, SCRYPT)
  return [
    'scrypt',
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored ?? '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const N = Number(n)
  const R = Number(r)
  const P = Number(p)
  if (!Number.isFinite(N) || !Number.isFinite(R) || !Number.isFinite(P)) return false
  // A hostile users.json could otherwise ask for parameters that hang the
  // process on every login attempt.
  if (N > 1 << 20 || R > 32 || P > 16) return false

  let expected: Buffer
  try {
    expected = Buffer.from(hashB64, 'base64url')
    const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
      N,
      r: R,
      p: P,
      maxmem: Math.max(64 * 1024 * 1024, 128 * N * R * 2),
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

const USERNAME_RE = /^[a-zA-Z0-9._-]{2,32}$/

export function validateUsername(input: string): { ok: true; username: string } | { ok: false; detail: string } {
  const username = (input ?? '').trim().toLowerCase()
  if (!username) return { ok: false, detail: 'Login nie może być pusty.' }
  if (!USERNAME_RE.test(username)) {
    return { ok: false, detail: 'Login: 2–32 znaki, litery, cyfry oraz . _ -' }
  }
  return { ok: true, username }
}

/**
 * Length over composition rules.
 *
 * Forcing a digit and a capital produces `Password1!` and a sticky note. Twelve
 * characters of anything is a better floor, and this is a single-operator
 * server behind a rate limiter, not a public signup form.
 */
export function validatePassword(input: string): { ok: true } | { ok: false; detail: string } {
  const p = input ?? ''
  if (p.length < 12) return { ok: false, detail: 'Hasło musi mieć co najmniej 12 znaków.' }
  if (p.length > 256) return { ok: false, detail: 'Hasło jest absurdalnie długie (max 256 znaków).' }
  return { ok: true }
}

export function summariseUser(u: StoredUser): UserSummary {
  return {
    username: u.username,
    role: u.role,
    created: u.created,
    ...(u.lastLogin ? { lastLogin: u.lastLogin } : {}),
  }
}

/**
 * Every account in the store, or a throw.
 *
 * A missing file is an empty store. Corrupt JSON, a non-array, a bad record, or
 * an I/O error must never look like emptiness — createUser used to read `[]`
 * from a broken users.json and persist a store holding only the new account.
 */
export async function readUsers(dataDir: string): Promise<StoredUser[]> {
  let raw: string
  try {
    raw = (await fs.readFile(usersPath(dataDir), 'utf8')).replace(/^﻿/, '')
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return []
    throw e
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`users.json is not valid JSON: ${(e as Error).message}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error('users.json must be a JSON array')
  }
  return parsed.map((entry, i) => parseStoredUser(entry, i))
}

function parseStoredUser(entry: unknown, index: number): StoredUser {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`users.json[${index}] is not an object`)
  }
  const u = entry as Partial<StoredUser>
  if (typeof u.username !== 'string' || !u.username.trim()) {
    throw new Error(`users.json[${index}] missing username`)
  }
  if (typeof u.password !== 'string' || !u.password) {
    throw new Error(`users.json[${index}] missing password hash`)
  }
  if (u.role !== undefined && u.role !== 'admin' && u.role !== 'agent') {
    throw new Error(`users.json[${index}] has unknown role`)
  }
  if (u.created !== undefined && typeof u.created !== 'string') {
    throw new Error(`users.json[${index}] has invalid created`)
  }
  if (u.lastLogin !== undefined && typeof u.lastLogin !== 'string') {
    throw new Error(`users.json[${index}] has invalid lastLogin`)
  }
  return {
    username: u.username.toLowerCase(),
    password: u.password,
    role: u.role === 'admin' ? 'admin' : 'agent',
    created: typeof u.created === 'string' ? u.created : new Date().toISOString(),
    ...(typeof u.lastLogin === 'string' ? { lastLogin: u.lastLogin } : {}),
  }
}

/**
 * Accounts for a decision that only reads (login).
 * Fails closed: an unreadable store authorises nobody.
 */
export async function readUsersOrEmpty(dataDir: string): Promise<StoredUser[]> {
  try {
    return await readUsers(dataDir)
  } catch {
    return []
  }
}

async function writeUsers(dataDir: string, users: StoredUser[]): Promise<void> {
  const p = usersPath(dataDir)
  await fs.mkdir(dirname(p), { recursive: true })
  await writeFileKeepingPrev(p, Buffer.from(`${JSON.stringify(users, null, 2)}\n`, 'utf8'), {
    mode: 0o600,
  })
}

export type UserResult = { ok: true; summary: UserSummary } | { ok: false; detail: string }

export async function createUser(
  dataDir: string,
  opts: { username: string; password: string; role: TokenRole },
): Promise<UserResult> {
  const name = validateUsername(opts.username)
  if (!name.ok) return { ok: false, detail: name.detail }
  const pw = validatePassword(opts.password)
  if (!pw.ok) return { ok: false, detail: pw.detail }

  return withStoreLock(usersPath(dataDir), async () => {
    const users = await readUsers(dataDir)
    if (users.some((u) => u.username === name.username)) {
      return { ok: false, detail: `Użytkownik „${name.username}" już istnieje.` }
    }
    const user: StoredUser = {
      username: name.username,
      password: await hashPassword(opts.password),
      role: opts.role === 'admin' ? 'admin' : 'agent',
      created: new Date().toISOString(),
    }
    await writeUsers(dataDir, [...users, user])
    return { ok: true, summary: summariseUser(user) }
  })
}

export async function changePassword(
  dataDir: string,
  username: string,
  next: string,
): Promise<UserResult> {
  const pw = validatePassword(next)
  if (!pw.ok) return { ok: false, detail: pw.detail }
  return withStoreLock(usersPath(dataDir), async () => {
    const users = await readUsers(dataDir)
    const u = users.find((x) => x.username === username.toLowerCase())
    if (!u) return { ok: false, detail: `Nie ma użytkownika „${username}".` }
    u.password = await hashPassword(next)
    await writeUsers(dataDir, users)
    return { ok: true, summary: summariseUser(u) }
  })
}

export async function deleteUser(dataDir: string, username: string): Promise<UserResult> {
  return withStoreLock(usersPath(dataDir), async () => {
    const users = await readUsers(dataDir)
    const u = users.find((x) => x.username === username.toLowerCase())
    if (!u) return { ok: false, detail: `Nie ma użytkownika „${username}".` }
    if (u.role === 'admin' && users.filter((x) => x.role === 'admin').length === 1) {
      // Same rule as the last admin token: the only way back in is SSH.
      return { ok: false, detail: 'To ostatnie konto administratora — najpierw utwórz drugie.' }
    }
    await writeUsers(
      dataDir,
      users.filter((x) => x.username !== u.username),
    )
    return { ok: true, summary: summariseUser(u) }
  })
}

export type LoginResult = { ok: true; user: StoredUser } | { ok: false }

/**
 * Verify a login.
 *
 * A missing user still costs a hash: returning early would let an attacker
 * separate "no such user" from "wrong password" by timing alone, which turns
 * one guess into a username oracle.
 */
export async function authenticate(
  dataDir: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  const users = await readUsersOrEmpty(dataDir)
  const user = users.find((u) => u.username === (username ?? '').trim().toLowerCase())
  const stored = user?.password ?? (await hashPassword('decoy-for-constant-time'))
  const ok = await verifyPassword(password ?? '', stored)
  if (!ok || !user) return { ok: false }
  return { ok: true, user }
}

/** Best-effort; a failed write must never fail a successful login. */
export async function touchLogin(dataDir: string, username: string): Promise<void> {
  try {
    await withStoreLock(usersPath(dataDir), async () => {
      const users = await readUsers(dataDir)
      const u = users.find((x) => x.username === username)
      if (!u) return
      u.lastLogin = new Date().toISOString()
      await writeUsers(dataDir, users)
    })
  } catch {
    // Telemetry must not deny a successful login, nor resurrect a corrupt store.
  }
}
