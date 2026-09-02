import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A block comment written as `/*` in JSX children position is not a comment.
 * It is text, and React renders it — which is how a paragraph of English
 * explaining an implementation detail ended up printed in the middle of a
 * Polish settings screen, in a packaged build, in front of the user.
 *
 * `eslint-plugin-react` has a rule for this. There is no eslint in this repo,
 * and adding one to catch a single mistake is a larger change than the mistake
 * deserves, so the check lives here: inside a `return ( … )` block, every
 * block comment must be braced.
 */

const PAGES = new URL('./pages', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p))
    else if (name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** Bare block comments inside any `return ( … )` in this source. */
export function leakedJsxComments(source: string): number[] {
  const lines = source.split(/\r?\n/)
  const leaked: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)return \($/.exec(lines[i])
    if (!open) continue
    // Bounded by the closing paren at the same indent. Scanning everything
    // after the first `return (` instead also flags section banners and helper
    // functions further down the file, which are ordinary code.
    const close = open[1] + ')'
    for (let j = i + 1; j < lines.length && !lines[j].startsWith(close); j++) {
      // A braced comment opens with `{/*`. A bare one starts the line with
      // `/*`, and everything up to `*/` becomes visible text.
      if (/^\s*\/\*/.test(lines[j]) && !/\{\s*\/\*/.test(lines[j])) leaked.push(j + 1)
    }
  }
  return leaked
}

describe('leakedJsxComments', () => {
  it('catches the mistake that shipped', () => {
    const bad = ['function C() {', '  return (', '    <div>', '      /*', '        note', '      */', '    </div>', '  )', '}'].join('\n')
    expect(leakedJsxComments(bad)).toEqual([4])
  })

  it('accepts a braced comment', () => {
    const ok = ['function C() {', '  return (', '    <div>', '      {/* note */}', '    </div>', '  )', '}'].join('\n')
    expect(leakedJsxComments(ok)).toEqual([])
  })

  it('leaves comments outside the JSX alone', () => {
    const ok = ['function C() {', '  return (', '    <div />', '  )', '}', '', '/* a section banner */', 'function helper() {}'].join('\n')
    expect(leakedJsxComments(ok)).toEqual([])
  })
})

describe('no page prints a comment to the screen', () => {
  const files = tsxFiles(PAGES)

  it('finds the pages to check', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  for (const file of files) {
    it(`${file.split(/[\/]/).pop()}`, () => {
      expect(leakedJsxComments(readFileSync(file, 'utf8'))).toEqual([])
    })
  }
})
