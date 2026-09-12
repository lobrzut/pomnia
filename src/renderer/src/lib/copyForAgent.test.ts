// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { promptForAgent, skillForAgent } from './copyForAgent'

/**
 * 0.1.83 shipped the copy behaviour with "Not verified by clicking" in its own
 * commit message, and it reached the operator wrong: a pasted `/oszczedny-kod`
 * came back as `Unknown command`. The pages still sit behind the vault gate, so
 * the click is still not testable here — but the text that click produces is,
 * and that is where the mistake actually lived.
 *
 * The second half of this file is the harder question the operator asked: the
 * two prompts that ship with the vault come out right, but will one a user
 * writes themselves? Those cases are below, and one of them was failing.
 */

const PROMPT = `---
description: Zanim agent napisze kod
arguments:
  - name: zadanie
    required: true
---
Zanim napiszesz choć linijkę na to zadanie:

{{zadanie}}

Przejdź drabinę i zatrzymaj się na pierwszym „tak":

1. Czy to w ogóle musi powstać?
`

describe('promptForAgent — the prompts that ship', () => {
  const out = promptForAgent(PROMPT)

  it('drops the frontmatter the loader needs and the reader does not', () => {
    expect(out).not.toContain('description:')
    expect(out).not.toContain('---')
  })

  it('leaves no slot to edit by hand', () => {
    expect(out).not.toContain('{{')
  })

  it('does not leave the hole where the slot was', () => {
    expect(out).not.toMatch(/\n{3,}/)
  })

  it('ends with one labelled line to type after pasting', () => {
    expect(out.trimEnd().endsWith('Zadanie:')).toBe(true)
  })

  it('keeps the instruction itself intact', () => {
    expect(out).toContain('Przejdź drabinę')
    expect(out).toContain('1. Czy to w ogóle musi powstać?')
  })
})

describe('promptForAgent — prompts a user writes', () => {
  it('re-offers a slot the frontmatter marked optional', () => {
    // The regression this file was extended for. The server marks a placeholder
    // it infers from the body as required, but one written out under
    // `arguments:` without `required: true` defaults to false. Filtering on the
    // declaration stripped the slot and offered nothing back, leaving "Zrob cos
    // z ." — a prompt asking about something it never names.
    const out = promptForAgent(
      '---\narguments:\n  - name: cos\n    description: d\n---\nZrob cos z {{cos}}.\n',
    )
    expect(out).not.toContain('{{')
    expect(out).toContain('Cos:')
  })

  it('works with no frontmatter at all', () => {
    const out = promptForAgent('Streszcz {{tekst}} w trzech zdaniach.\n')
    expect(out).toContain('Streszcz')
    expect(out).toContain('Tekst:')
  })

  it('offers one line per distinct slot, in the order they appear', () => {
    const out = promptForAgent('Z {{objaw}} i {{kiedy}} zrob zgloszenie.\n')
    expect(out.trimEnd().endsWith('Objaw: \nKiedy:')).toBe(true)
  })

  it('does not repeat a slot used twice', () => {
    const out = promptForAgent('{{co}} — powtorz {{co}} inaczej.\n')
    expect(out.match(/^Co: $/gm)?.length).toBe(1)
  })

  it('survives Windows line endings', () => {
    const out = promptForAgent('---\r\ndescription: d\r\n---\r\nZrob {{x}}.\r\n')
    expect(out).not.toContain('description:')
    expect(out).toContain('X:')
  })

  it('leaves non-ASCII braces alone, because the server does too', () => {
    // prompts.ts matches [A-Za-z0-9_-]. `{{zgłoszenie}}` is prose to the server,
    // so cutting it here would silently delete a sentence the author wrote.
    const out = promptForAgent('Opisz {{zgłoszenie}} krótko.\n')
    expect(out).toContain('{{zgłoszenie}}')
    expect(out.trim().endsWith('krótko.')).toBe(true)
  })

  it('adds no trailing label when the prompt has no slots', () => {
    const out = promptForAgent('---\ndescription: d\n---\nPisz zwięźle.\n')
    expect(out.trim()).toBe('Pisz zwięźle.')
  })

  it('keeps a mid-sentence slot named, so the sentence still reads', () => {
    // The second defect the probe found. `prompts.ts` documents exactly this
    // shape, so deleting the slot broke the form the server tells people to
    // write: "Przetlumacz  na ." — two spaces and a stranded full stop, which
    // reads as a bug in Pomnia rather than as something to fill in.
    const out = promptForAgent('Przetlumacz {{tekst}} na {{jezyk}}. Zachowaj ton.\n')
    expect(out).toBe('Przetlumacz {tekst} na {jezyk}. Zachowaj ton.\n\nTekst: \nJezyk: \n')
  })

  it('uses single braces inline, never the ones the server would expand', () => {
    const out = promptForAgent('Zamien {{a}} na cos innego.\n')
    expect(out).not.toContain('{{')
    expect(out).toContain('{a}')
  })

  it('leaves no dangling space where a trailing slot was cut', () => {
    // Cutting `{{x}}` off the end of a line leaves the space before it. The
    // label lines below do end in a space — deliberately, that is where the
    // reader types — so this asserts the whole shape rather than sweeping for
    // trailing whitespace and catching the intentional kind too.
    const out = promptForAgent('Zrob to: {{x}}\nDalej.\n')
    expect(out).toBe('Zrob to:\nDalej.\n\nX: \n')
  })
})

/** Stands in for the bilingual label, so these test detection, not wording. */
const note = (files: string[]): string => 'LEFT BEHIND: ' + files.join(', ')

describe('skillForAgent', () => {
  it('travels whole — frontmatter included, because a skill is read as one', () => {
    const raw = '---\nname: build-our-way\ndescription: d\n---\n\n# Doktryna\n\nTreść.\n'
    const out = skillForAgent(raw, note)
    expect(out).toContain('name: build-our-way')
    expect(out).toContain('# Doktryna')
    expect(out.endsWith('\n')).toBe(true)
  })

  it('is unbothered by a skill that has no frontmatter', () => {
    expect(skillForAgent('# Luzny skill\n\nTresc.', note)).toBe('# Luzny skill\n\nTresc.\n')
  })

  it('says nothing when the skill is self-contained', () => {
    // 94 of the 208 skills in the vault are pure doctrine. A footer on those
    // would be noise on the majority case that already works.
    expect(skillForAgent('Pisz zwiezle. Bez emoji.', note)).not.toContain('LEFT BEHIND')
  })

  it('names the files a clipboard cannot carry', () => {
    // Measured: 114 of 208 skills tell the agent to open a file like this. The
    // file is in the vault, not in the paste, and silence here is what makes an
    // agent invent the contents of a script it cannot see.
    const out = skillForAgent('Uruchom: python scripts/recon.py --domain x\n', note)
    expect(out).toContain('LEFT BEHIND: scripts/recon.py')
  })

  it('catches every package folder the convention uses', () => {
    const out = skillForAgent(
      'Patrz references/a.md, templates/b.md, assets/c.png, scripts/d.py.\n',
      note,
    )
    expect(out).toContain('references/a.md')
    expect(out).toContain('templates/b.md')
    expect(out).toContain('assets/c.png')
    expect(out).toContain('scripts/d.py')
  })

  it('names a file once however often the skill mentions it', () => {
    const out = skillForAgent('scripts/x.py raz, scripts/x.py dwa.\n', note)
    expect(out.match(/scripts\/x\.py/g)?.length).toBe(3) // twice in the body, once in the note
  })

  it('names a nested reference in full, not just its folder', () => {
    // A fifth of the real references are two levels deep. "references/art-styles"
    // tells the agent less than it needs; the file is the thing it cannot open.
    const out = skillForAgent('Zobacz references/art-styles/kandinsky.md tam.\n', note)
    expect(out).toContain('LEFT BEHIND: references/art-styles/kandinsky.md')
  })

  it('does not fire on a bare folder name', () => {
    // "put your own files in templates/" is advice, not a reference to one.
    expect(skillForAgent('Trzymaj swoje pliki w templates/.', note)).not.toContain('LEFT BEHIND')
  })

  it('separates the note so markdown reads it as a rule, not a heading', () => {
    // `text` directly above `---` is a setext h2. A blank line between them is
    // the difference between a horizontal rule and the last line of the skill
    // silently becoming a title.
    const out = skillForAgent('Ostatnie zdanie.\nPatrz scripts/x.py', (f) => '---\n' + f.join(''))
    expect(out).toContain('scripts/x.py\n\n---\n')
  })
})
