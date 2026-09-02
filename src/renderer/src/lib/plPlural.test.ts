import { describe, expect, it } from 'vitest'

import { plCount, plForm } from './plPlural.js'

const conn = (n: number): string => plCount(n, 'połączenie', 'połączenia', 'połączeń')
const note = (n: number): string => plCount(n, 'notatka', 'notatki', 'notatek')

describe('plForm', () => {
  it('uses the three forms Polish actually has', () => {
    expect(conn(1)).toBe('1 połączenie')
    expect(conn(2)).toBe('2 połączenia')
    expect(conn(4)).toBe('4 połączenia')
    expect(conn(5)).toBe('5 połączeń')
  })

  it('gives the teens the many form despite their final digit', () => {
    // 12-14 end in 2-4 and still take "połączeń". This is the case everyone
    // gets wrong, including the first version of this code.
    expect(conn(12)).toBe('12 połączeń')
    expect(conn(13)).toBe('13 połączeń')
    expect(conn(14)).toBe('14 połączeń')
  })

  it('returns to the few form past the teens', () => {
    expect(conn(22)).toBe('22 połączenia')
    expect(conn(24)).toBe('24 połączenia')
    expect(conn(25)).toBe('25 połączeń')
  })

  it('handles zero and large numbers', () => {
    expect(conn(0)).toBe('0 połączeń')
    expect(conn(101)).toBe('101 połączeń')
    expect(conn(102)).toBe('102 połączenia')
    expect(conn(111)).toBe('111 połączeń')
  })

  it('works for any noun, not just the one it was written for', () => {
    expect(note(1)).toBe('1 notatka')
    expect(note(3)).toBe('3 notatki')
    expect(note(13)).toBe('13 notatek')
    expect(note(34)).toBe('34 notatki')
  })

  it('exposes the bare form for callers that place the number themselves', () => {
    expect(plForm(1, 'a', 'b', 'c')).toBe('a')
    expect(plForm(3, 'a', 'b', 'c')).toBe('b')
    expect(plForm(9, 'a', 'b', 'c')).toBe('c')
  })
})
