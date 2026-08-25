import { describe, expect, it } from 'vitest'

import { decidePortCollision } from '../src/mcp/server.js'

/**
 * A bare `brain-core` on a machine running Pomnia Desktop used to find :7862
 * taken, see `service: brain-core` on /healthz, and adopt — handing the operator
 * the desktop's personal vault while logging a clean start. Presence is not
 * identity; these cases pin the difference.
 */
const DESKTOP = 'Pomnia Desktop (DESKTOP-4KG4JUH)'
const SERVER = 'pomnia-master (comfy)'
const base = { port: 7862, url: 'http://127.0.0.1:7862' }

describe('decidePortCollision', () => {
  it('refuses a different Pomnia rather than serving its vault', () => {
    const v = decidePortCollision({ ...base, other: { pomnia: true, owner: DESKTOP }, mine: SERVER })
    expect(v.action).toBe('refuse')
    if (v.action !== 'refuse') return
    // The operator has to be able to act on it: both names and a way out.
    expect(v.message).toContain(DESKTOP)
    expect(v.message).toContain(SERVER)
    expect(v.message).toContain('--port')
  })

  it('adopts an orphan of the same install', () => {
    const v = decidePortCollision({ ...base, other: { pomnia: true, owner: SERVER }, mine: SERVER })
    expect(v.action).toBe('adopt')
  })

  it('still adopts when the other side reports no owner', () => {
    // Older instance, or one still starting up — refusing here would break
    // restarts that work today.
    const v = decidePortCollision({ ...base, other: { pomnia: true, owner: null }, mine: SERVER })
    expect(v.action).toBe('adopt')
    if (v.action === 'adopt') expect(v.note).toContain('owner unreported')
  })

  it('still adopts when this instance has no owner yet', () => {
    const v = decidePortCollision({ ...base, other: { pomnia: true, owner: DESKTOP }, mine: null })
    expect(v.action).toBe('adopt')
  })

  it('leaves a non-Pomnia listener to the original bind error', () => {
    const v = decidePortCollision({ ...base, other: { pomnia: false, owner: null }, mine: SERVER })
    expect(v.action).toBe('rethrow')
  })
})
