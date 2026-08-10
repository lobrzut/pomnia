import { describe, expect, it } from 'vitest'

import {
  CSRF_HEADER,
  SESSION_COOKIE,
  clearCookie,
  createSessionStore,
  readCookie,
  sessionCookie,
} from './sessions.js'

describe('session store', () => {
  it('issues a session with two independent secrets', () => {
    const s = createSessionStore().create('helluk', 'admin')
    expect(s.id.length).toBeGreaterThan(30)
    expect(s.csrf.length).toBeGreaterThan(30)
    expect(s.id).not.toBe(s.csrf)
  })

  it('never repeats an id', () => {
    const st = createSessionStore()
    const ids = new Set(Array.from({ length: 300 }, () => st.create('u', 'admin').id))
    expect(ids.size).toBe(300)
  })

  it('resolves a live session and rejects an unknown one', () => {
    const st = createSessionStore()
    const s = st.create('helluk', 'admin')
    expect(st.get(s.id)?.username).toBe('helluk')
    expect(st.get('nope')).toBeNull()
    expect(st.get(undefined)).toBeNull()
  })

  it('forgets a session on logout', () => {
    const st = createSessionStore()
    const s = st.create('u', 'admin')
    st.destroy(s.id)
    expect(st.get(s.id)).toBeNull()
  })

  /** A password change must not leave the old session usable. */
  it('drops every session for one user', () => {
    const st = createSessionStore()
    const a = st.create('helluk', 'admin')
    const b = st.create('helluk', 'admin')
    const other = st.create('someone', 'admin')
    expect(st.destroyUser('helluk')).toBe(2)
    expect(st.get(a.id)).toBeNull()
    expect(st.get(b.id)).toBeNull()
    expect(st.get(other.id)).not.toBeNull()
  })

  it('expires on idle', () => {
    let now = 1_000_000
    const st = createSessionStore(() => now)
    const s = st.create('u', 'admin')
    now += 7 * 60 * 60 * 1000
    expect(st.get(s.id)).not.toBeNull() // activity refreshes it
    now += 7 * 60 * 60 * 1000
    expect(st.get(s.id)).not.toBeNull()
    now += 9 * 60 * 60 * 1000 // idle past the window
    expect(st.get(s.id)).toBeNull()
  })

  /** Activity must not extend a session for ever. */
  it('expires at the absolute cap even when used constantly', () => {
    let now = 1_000_000
    const st = createSessionStore(() => now)
    const s = st.create('u', 'admin')
    for (let i = 0; i < 30; i++) {
      now += 6 * 60 * 60 * 1000
      st.get(s.id)
    }
    expect(st.get(s.id)).toBeNull()
  })
})

describe('csrf', () => {
  it('accepts the matching token and nothing else', () => {
    const st = createSessionStore()
    const s = st.create('u', 'admin')
    expect(st.checkCsrf(s, s.csrf)).toBe(true)
    expect(st.checkCsrf(s, 'wrong')).toBe(false)
    expect(st.checkCsrf(s, '')).toBe(false)
    expect(st.checkCsrf(s, undefined)).toBe(false)
  })

  /** The session id must not be usable as the CSRF token. */
  it('does not accept the session id in its place', () => {
    const st = createSessionStore()
    const s = st.create('u', 'admin')
    expect(st.checkCsrf(s, s.id)).toBe(false)
  })

  it('does not throw on a length mismatch', () => {
    const st = createSessionStore()
    const s = st.create('u', 'admin')
    expect(() => st.checkCsrf(s, 'x')).not.toThrow()
  })
})

describe('cookies', () => {
  it('is HttpOnly and SameSite=Strict, scoped to the panel', () => {
    const c = sessionCookie('abc', false)
    expect(c).toContain(`${SESSION_COOKIE}=abc`)
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain('Path=/admin')
  })

  /**
   * Secure over plain HTTP would make the browser drop the cookie and the
   * panel would look broken on a LAN with no explanation.
   */
  it('adds Secure only over HTTPS', () => {
    expect(sessionCookie('abc', true)).toContain('Secure')
    expect(sessionCookie('abc', false)).not.toContain('Secure')
  })

  it('clears with Max-Age=0 and the same attributes', () => {
    const c = clearCookie(false)
    expect(c).toContain('Max-Age=0')
    expect(c).toContain('Path=/admin')
    expect(c).toContain('HttpOnly')
  })

  it('parses one cookie out of many', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=xyz; b=2`, SESSION_COOKIE)).toBe('xyz')
    expect(readCookie('a=1; b=2', SESSION_COOKIE)).toBeUndefined()
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined()
    expect(readCookie('malformed', SESSION_COOKIE)).toBeUndefined()
  })

  it('does not match a cookie whose name merely ends the same', () => {
    expect(readCookie(`x_${SESSION_COOKIE}=evil`, SESSION_COOKIE)).toBeUndefined()
  })
})

describe('constants', () => {
  it('names the CSRF header once, so client and server cannot drift', () => {
    expect(CSRF_HEADER).toBe('x-pomnia-csrf')
  })
})
