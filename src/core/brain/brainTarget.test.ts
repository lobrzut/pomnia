import { describe, expect, it } from 'vitest'

import { canEditBrainUrl, resolveBrainTarget } from './brainTarget.js'

describe('resolveBrainTarget', () => {
  it('pins Mini to remote whatever the stored setting says', () => {
    // Mini ships no brain, so an inherited 'embedded' would point it at a
    // server that is not there.
    expect(resolveBrainTarget({ mini: true, simpleMode: false, stored: 'embedded' })).toBe('remote')
    expect(resolveBrainTarget({ mini: true, simpleMode: true, stored: 'embedded' })).toBe('remote')
  })

  it('keeps simple mode on the embedded brain', () => {
    expect(resolveBrainTarget({ mini: false, simpleMode: true, stored: 'remote' })).toBe('embedded')
  })

  it('otherwise honours what the user chose', () => {
    expect(resolveBrainTarget({ mini: false, simpleMode: false, stored: 'remote' })).toBe('remote')
    expect(resolveBrainTarget({ mini: false, simpleMode: false, stored: 'embedded' })).toBe('embedded')
  })
})

describe('canEditBrainUrl', () => {
  it('allows editing a remote address and not the embedded one', () => {
    expect(canEditBrainUrl('remote')).toBe(true)
    expect(canEditBrainUrl('embedded')).toBe(false)
  })

  it('agrees with the effective target in every Mini case', () => {
    // The regression in full: Mini resolved to 'remote' and showed a remote
    // placeholder, while a guard reading the stored 'embedded' silently threw
    // away every keystroke. Anything that resolves to remote must be typeable.
    for (const stored of ['embedded', 'remote'] as const) {
      for (const simpleMode of [false, true]) {
        const effective = resolveBrainTarget({ mini: true, simpleMode, stored })
        expect(canEditBrainUrl(effective)).toBe(true)
      }
    }
  })
})
