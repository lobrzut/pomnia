import { describe, expect, it } from 'vitest'

import { filterNoiseBlocks } from './ocr.js'

/**
 * The case this exists for: a page that is part text, part picture.
 *
 * Filtering whole pages scored the paragraph and the diagram together, so a
 * page with two paragraphs around a chess diagram lost the paragraphs too. In
 * a scanned primer that is most of the book.
 *
 * The strings below are from the real book — the prose from pages that passed,
 * the noise from the two that the page-level floor rejected.
 */
describe('filterNoiseBlocks', () => {
  const PROSE =
    'Już na samym początku chcę wyróżnić Ciebie, Czytelniku, za to, że sięgnąłeś po tę książkę i chcesz nauczyć się grać w szachy.'
  const MORE =
    'WSTEP Ideą tej książki jest zachęcenie Polaków nie tylko do gry w szachy, ale przede wszystkim do myślenia.'
  const DIAGRAM = 'sd 7 s - un fl U ny KU | 1 Mu h ai Bm HI u = | hi "m1 - M_'
  const DIAGRAM2 = 'Se ake ase 0 oo Tir are EZ eda eC aie. | I iL je ; 2 ble ui ME:'

  it('keeps the text on a page that also holds a diagram', () => {
    const page = [PROSE, DIAGRAM, MORE].join('\n\n')
    const r = filterNoiseBlocks(page)
    expect(r.text).toContain('Czytelniku')
    expect(r.text).toContain('Ideą tej książki')
    expect(r.text).not.toContain('Mu h ai Bm')
    expect(r.kept).toBe(2)
    expect(r.dropped).toBe(1)
  })

  it('empties a page that is only picture', () => {
    const r = filterNoiseBlocks([DIAGRAM, DIAGRAM2].join('\n\n'))
    expect(r.text).toBe('')
    expect(r.kept).toBe(0)
    expect(r.dropped).toBe(2)
  })

  it('leaves a page of prose untouched', () => {
    const page = [PROSE, MORE].join('\n\n')
    const r = filterNoiseBlocks(page)
    expect(r.dropped).toBe(0)
    expect(r.text.split('\n\n')).toHaveLength(2)
  })

  it('keeps a short heading, which is words and not noise', () => {
    // Length alone would throw these away; they are the titles of the sections
    // the paragraphs below them belong to.
    const r = filterNoiseBlocks(['SPIS TRESCI', PROSE].join('\n\n'))
    expect(r.text).toContain('SPIS TRESCI')
    expect(r.dropped).toBe(0)
  })

  it('splits on blank lines and tolerates ragged whitespace', () => {
    const r = filterNoiseBlocks(`${PROSE}\n   \n\n${MORE}\n`)
    expect(r.kept).toBe(2)
  })

  it('handles empty and whitespace input', () => {
    expect(filterNoiseBlocks('')).toEqual({ text: '', kept: 0, dropped: 0 })
    expect(filterNoiseBlocks('  \n\n  ')).toEqual({ text: '', kept: 0, dropped: 0 })
  })

  it('does not reflow what it keeps', () => {
    // The block is a markdown paragraph on its way to a vault; rewriting its
    // line breaks would change a file nobody asked to have edited.
    const block = 'Linia pierwsza\nlinia druga ciagnie sie dalej'
    expect(filterNoiseBlocks(block).text).toBe(block)
  })
})
