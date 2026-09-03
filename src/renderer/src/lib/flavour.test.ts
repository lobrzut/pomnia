import { describe, expect, it } from 'vitest'

import { FLAVOUR, isMini, MINI_ROUTES } from './flavour.js'

/**
 * Mini exists because measurement said wiring, not distillation, is where the
 * value is: the client whose MCP worked saved directly 69% of the time; the one
 * whose search was broken saved 7% and had 492 conversations distilled to cover
 * for it.
 */
describe('build flavour', () => {
  it('defaults to the full app', () => {
    // No env var, no surprises: an ordinary build is the app it has always been.
    expect(FLAVOUR).toBe('full')
    expect(isMini).toBe(false)
  })

  it('ships exactly the four screens Mini is for', () => {
    // Connect is the reason it exists; Settings carries the server and the
    // token; Import is how material reaches a memory Mini does not hold — it
    // parses here and sends to the server, the only sink it has.
    expect([...MINI_ROUTES]).toEqual(['connect', 'settings', 'skills', 'import'])
  })

  it('puts the reason it exists first and the errand last', () => {
    // The sidebar renders in this order, so Connect leads and Import — the
    // occasional job, not the daily screen — sits at the bottom.
    expect(MINI_ROUTES[0]).toBe('connect')
    expect(MINI_ROUTES[MINI_ROUTES.length - 1]).toBe('import')
  })

  it('lands on Connect, not on a page it does not have', () => {
    // A route inherited from a full install must resolve to something Mini
    // actually ships, and the first entry is what App falls back to.
    expect(MINI_ROUTES[0]).toBe('connect')
  })
})
