import { describe, expect, it } from 'vitest'

import { safeVaultPath } from './paths.js'

describe('safeVaultPath — generated catalogues never travel', () => {
  it('refuses skills/index.json', () => {
    // It records absolute paths of the machine that wrote it, so the two sides
    // can never agree: on the live vault it had reached index-19.json.
    const v = safeVaultPath('skills/index.json')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('machine-state')
  })

  it('still accepts an ordinary skill', () => {
    expect(safeVaultPath('skills/brain/build-our-way.md').ok).toBe(true)
  })

  it('does not refuse a similarly named file elsewhere', () => {
    // The rule is the exact path, not the basename — a note called index.json
    // in another folder is somebody's content.
    expect(safeVaultPath('state/index.json').ok).toBe(true)
  })

  it('does not refuse a nested index under skills', () => {
    expect(safeVaultPath('skills/cli/index.json').ok).toBe(true)
  })

  it('keeps refusing the ownership marker', () => {
    const v = safeVaultPath('state/vault-writer.json')
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toBe('machine-state')
  })
})
