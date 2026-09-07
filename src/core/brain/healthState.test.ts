import { describe, expect, it } from 'vitest'

import { classify, freshMemory, observe, type HealthState } from './healthState.js'

/** Feed a sequence of probes and collect everything the user would be told. */
function run(probes: HealthState[]): { announced: (HealthState | null)[] } {
  let memory = freshMemory()
  const announced: (HealthState | null)[] = []
  for (const p of probes) {
    const v = observe(memory, p)
    memory = v.memory
    if (v.announce) announced.push(v.announce)
  }
  return { announced }
}

describe('classify', () => {
  it('reads a refused credential as unauthorized, not as an outage', () => {
    expect(classify({ hasTarget: true, hasToken: true, status: 401 })).toBe('unauthorized')
    expect(classify({ hasTarget: true, hasToken: true, status: 403 })).toBe('unauthorized')
  })

  it('treats no answer at all as unreachable', () => {
    expect(classify({ hasTarget: true, hasToken: true })).toBe('unreachable')
  })

  it('separates a broken server from a missing one', () => {
    // A 500 means something answered. Calling that "unreachable" would send the
    // user to look at their network for a problem that is on the server.
    expect(classify({ hasTarget: true, hasToken: true, status: 500 })).toBe('unreachable')
    expect(classify({ hasTarget: true, hasToken: true, status: 404 })).toBe('ok')
    expect(classify({ hasTarget: true, hasToken: true, status: 200 })).toBe('ok')
  })

  it('reports the two setup faults before trying to read a status', () => {
    expect(classify({ hasTarget: false, hasToken: true, status: 200 })).toBe('no-target')
    expect(classify({ hasTarget: true, hasToken: false, status: 200 })).toBe('unauthorized')
  })
})

describe('observe', () => {
  it('says nothing at all while everything works', () => {
    expect(run(['ok', 'ok', 'ok']).announced).toEqual([])
  })

  it('does not raise an alarm on a single unreachable probe', () => {
    // A laptop suspends, wifi drops, a container restarts. One failure is
    // ordinary life, and interrupting for it is how a tray gets ignored.
    expect(run(['ok', 'unreachable']).announced).toEqual([])
  })

  it('raises it once the failure repeats', () => {
    expect(run(['ok', 'unreachable', 'unreachable']).announced).toEqual(['unreachable'])
  })

  it('does not repeat itself while the fault persists', () => {
    const r = run(['ok', 'unreachable', 'unreachable', 'unreachable', 'unreachable'])
    expect(r.announced).toEqual(['unreachable'])
  })

  it('announces a rejected token immediately', () => {
    // The server gave a definite answer about the credential. A second opinion
    // on a definite answer only delays the fix.
    expect(run(['ok', 'unauthorized']).announced).toEqual(['unauthorized'])
  })

  it('reports recovery, so the user learns it is safe to carry on', () => {
    let memory = freshMemory()
    for (const p of ['ok', 'unauthorized'] as HealthState[]) memory = observe(memory, p).memory
    const back = observe(memory, 'ok')
    expect(back.announce).toBe('ok')
    expect(back.recovered).toBe(true)
  })

  it('stays quiet when the first thing it ever sees is healthy', () => {
    // Announcing "ok" at startup is a notification nobody asked for.
    expect(run(['ok']).announced).toEqual([])
  })

  it('speaks up when the first thing it ever sees is broken', () => {
    expect(run(['unauthorized']).announced).toEqual(['unauthorized'])
  })

  it('resets the streak when the failure mode changes', () => {
    // unreachable, then a different fault: the new one is judged on its own.
    expect(run(['ok', 'unreachable', 'unauthorized']).announced).toEqual(['unauthorized'])
  })

  it('handles a flapping link without alarming on every flap', () => {
    const r = run(['ok', 'unreachable', 'ok', 'unreachable', 'ok', 'unreachable'])
    expect(r.announced).toEqual([])
  })
})
