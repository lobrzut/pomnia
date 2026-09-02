import { describe, expect, it } from 'vitest'

import { OCR_MIN_CHARS, OCR_QUALITY_FLOOR, pageTextQuality } from './ocr.js'

/**
 * Calibrated against a real book, not against intuition.
 *
 * 20 pages of a scanned Polish chess primer were OCR'd and scored by hand:
 * prose landed between 0.57 and 0.85, and the two pages that were chess
 * diagrams scored 0.05 and 0.22. Every string below is taken from that run.
 */
describe('pageTextQuality', () => {
  const real = {
    cover: 'Michat Kanarkiewicz SZACHY W GODZINE Podrecznik dla poczatkujacych Wejherowo, 2020',
    prose:
      'Już na samym początku chcę wyróżnić Ciebie, Czytelniku, za to, że sięgnąłeś po tę książkę i chcesz nauczyć się grać w szachy.',
    intro:
      'WSTEP Ideą tej książki jest zachęcenie Polaków nie tylko do gry w szachy, ale przede wszystkim do myślenia.',
    // A table of contents: dot leaders and OCR damage, but still a real page.
    contents: 'SPIS TRESCI POdziGKOWanIG.. . cuca ne aera sien ROMA A pa Wstep 11 Jak czytac te ksiazke 13',
    // Both of these are chess diagrams the OCR guessed at.
    diagramA: 'sd 7 s - un fl U ny KU | 1 Mu h ai Bm HI u = | hi "m1 - M_',
    diagramB: 'Se ake ase 0 oo Tir are EZ eda eC aie. | I iL je ; 2 ble ui ME:',
  }

  it('scores real prose well above the floor', () => {
    expect(pageTextQuality(real.prose)).toBeGreaterThan(OCR_QUALITY_FLOOR)
    expect(pageTextQuality(real.intro)).toBeGreaterThan(OCR_QUALITY_FLOOR)
    expect(pageTextQuality(real.cover)).toBeGreaterThan(OCR_QUALITY_FLOOR)
  })

  it('keeps a damaged table of contents, which is still a page of the book', () => {
    // Scored 0.63 in the real run. Filtering has to be about pictures, not
    // about OCR being imperfect — imperfect text is still text.
    expect(pageTextQuality(real.contents)).toBeGreaterThan(OCR_QUALITY_FLOOR)
  })

  it('scores guessed-at diagrams far below it', () => {
    expect(pageTextQuality(real.diagramA)).toBeLessThan(OCR_QUALITY_FLOOR)
    expect(pageTextQuality(real.diagramB)).toBeLessThan(OCR_QUALITY_FLOOR)
  })

  it('leaves a clear margin either side of the cut', () => {
    // The whole point of measuring first: the gap is wide, so the threshold is
    // not balanced on the edge of the evidence.
    const worstKept = Math.min(pageTextQuality(real.contents), pageTextQuality(real.cover))
    const bestDropped = Math.max(pageTextQuality(real.diagramA), pageTextQuality(real.diagramB))
    expect(worstKept - bestDropped).toBeGreaterThan(0.25)
  })

  it('handles empty and whitespace input', () => {
    expect(pageTextQuality('')).toBe(0)
    expect(pageTextQuality('   \n\t ')).toBe(0)
  })

  it('does not count single letters and stray marks as words', () => {
    expect(pageTextQuality('a b c | 1 2 . ; -')).toBe(0)
  })

  it('counts words in any alphabet, not just ASCII', () => {
    // \p{L} rather than [a-z]: a Polish page is mostly non-ASCII letters, and
    // an ASCII-only rule would have thrown away the best pages in the book.
    expect(pageTextQuality('zażółć gęślą jaźń wypełnić')).toBe(1)
  })

  it('exposes a minimum length, below which there is nothing to judge', () => {
    expect(OCR_MIN_CHARS).toBeGreaterThan(0)
  })
})
