import { describe, expect, it } from 'vitest'

import { conversationTitle, MAX_TITLE } from './conversationTitle.js'

describe('conversationTitle', () => {
  it('drops the timestamp wrapper the client injects', () => {
    // The exact shape that named 406 notes after the clock.
    const t = conversationTitle(
      '<timestamp>Sunday, Aug 30, 2026, 9:52 PM (UTC+2)</timestamp>sprawdz dlaczego pomnia nie laczy sie do mcp',
    )
    expect(t).toBe('sprawdz dlaczego pomnia nie laczy sie do mcp')
  })

  it('drops several leading blocks in a row', () => {
    const t = conversationTitle(
      '<timestamp>whenever</timestamp>\n<environment_details>cwd=/x</environment_details>\n  napraw build',
    )
    expect(t).toBe('napraw build')
  })

  it('returns undefined when the message is nothing but metadata', () => {
    // The caller then falls back to the id. An id is opaque; a date dressed up
    // as a subject is worse, because it looks like it means something.
    expect(conversationTitle('<timestamp>Sunday, Aug 30, 2026</timestamp>')).toBeUndefined()
    expect(conversationTitle('   ')).toBeUndefined()
  })

  it('leaves an ordinary message alone', () => {
    expect(conversationTitle('dlaczego sync robi kopie konfliktowe?')).toBe(
      'dlaczego sync robi kopie konfliktowe?',
    )
  })

  it('does not strip markup from the middle of a question', () => {
    // Someone asking about a tag must not have their question mangled.
    const t = conversationTitle('czemu <div> psuje layout')
    expect(t).toBe('czemu <div> psuje layout')
  })

  it('collapses whitespace and caps the length', () => {
    const t = conversationTitle('a  b\n\nc ' + 'x'.repeat(200))
    expect(t?.length).toBe(MAX_TITLE)
    expect(t?.startsWith('a b c ')).toBe(true)
  })

  it('handles a bare unclosed tag', () => {
    expect(conversationTitle('<system-reminder>zrob X')).toBe('zrob X')
  })

  it('does not confuse a nested tag of another name', () => {
    expect(conversationTitle('<a><b>x</b></a>reszta')).toBe('reszta')
  })
})
