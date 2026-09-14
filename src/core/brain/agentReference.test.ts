// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { REFERENCE_PREFIX, referenceForAgent, skillCallName } from './agentReference.js'

describe('skillCallName', () => {
  it('names an own skill bare, from either side of the wire', () => {
    expect(skillCallName({ kind: 'own', name: 'build-our-way' })).toBe('build-our-way')
    expect(skillCallName({ kind: 'brain', name: 'build-our-way' })).toBe('build-our-way')
  })

  it('names a categorised package with its category, whatever else shares the name', () => {
    // `category/name` never looks in brain/, and one category cannot hold the
    // same name twice, so this is exact without knowing the catalogue.
    expect(skillCallName({ kind: 'cli', name: 'art-of-war-skill', category: 'strategy' })).toBe(
      'strategy/art-of-war-skill',
    )
  })

  it('refuses to name an uncategorised package, from Mini or from the desktop', () => {
    // On the live server, 5 of 5 sampled uncategorised packages had a filed
    // twin, so their bare names came back "ambiguous". The caller copies the
    // text rather than hand an agent a reference that fails.
    expect(skillCallName({ kind: 'cli', name: '01-recon-osint' })).toBeNull()
    expect(skillCallName({ kind: 'imported', name: 'nmap-recon' })).toBeNull()
  })
})

describe('referenceForAgent', () => {
  it('keeps a fixed prefix, because agent rules are taught to look for it', () => {
    expect(REFERENCE_PREFIX).toBe('Pomnia MCP:')
  })

  it('names one skill on one line', () => {
    expect(referenceForAgent({ skills: ['build-our-way'], prompts: [] })).toBe(
      'Pomnia MCP: get_skill build-our-way\n',
    )
  })

  it('mixes skills and prompts, with arguments last so the typing happens at the end', () => {
    const out = referenceForAgent({
      skills: ['build-our-way', 'strategy/art-of-war-skill'],
      prompts: [{ name: 'oszczedny-kod', arguments: [{ name: 'zadanie', required: true }] }],
    })
    expect(out).toBe(
      'Pomnia MCP: get_skill build-our-way, strategy/art-of-war-skill; get_prompt oszczedny-kod\nzadanie: \n',
    )
  })

  it('offers a line for an optional argument too', () => {
    const out = referenceForAgent({
      skills: [],
      prompts: [
        {
          name: 'zglos-blad',
          arguments: [
            { name: 'objaw', required: true },
            { name: 'kiedy', required: false },
          ],
        },
      ],
    })
    expect(out).toBe('Pomnia MCP: get_prompt zglos-blad\nobjaw: \nkiedy: \n')
  })

  it('says whose argument it is when two prompts use the same name', () => {
    const out = referenceForAgent({
      skills: [],
      prompts: [
        { name: 'a', arguments: [{ name: 'temat', required: true }] },
        {
          name: 'b',
          arguments: [
            { name: 'temat', required: true },
            { name: 'ton', required: false },
          ],
        },
      ],
    })
    expect(out).toBe('Pomnia MCP: get_prompt a, b\ntemat (a): \ntemat (b): \nton: \n')
  })

  it('gives nothing when nothing is picked', () => {
    expect(referenceForAgent({ skills: [], prompts: [] })).toBe('')
  })
})
