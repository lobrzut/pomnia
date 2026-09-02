import { describe, expect, it } from 'vitest'

import { uiLabels } from './labels.js'

describe('Polish counts for connections', () => {
  const f = (n: number): string => uiLabels().seenClientsConnects(n)

  it('uses the three forms Polish actually has', () => {
    expect(f(1)).toBe('1 połączenie')
    expect(f(2)).toBe('2 połączenia')
    expect(f(4)).toBe('4 połączenia')
    expect(f(5)).toBe('5 połączeń')
  })

  it('gives the teens the last form despite their final digit', () => {
    // 12-14 end in 2-4 and still take "połączeń". Getting this wrong is the
    // usual way software written in English reads as foreign.
    expect(f(12)).toBe('12 połączeń')
    expect(f(13)).toBe('13 połączeń')
    expect(f(14)).toBe('14 połączeń')
  })

  it('returns to the middle form past the teens', () => {
    expect(f(22)).toBe('22 połączenia')
    expect(f(23)).toBe('23 połączenia')
    expect(f(25)).toBe('25 połączeń')
  })

  it('handles zero and large numbers', () => {
    expect(f(0)).toBe('0 połączeń')
    expect(f(101)).toBe('101 połączeń')
    expect(f(102)).toBe('102 połączenia')
  })
})
