import { describe, expect, it } from 'vitest'
import {
  formatPipelineProgressLabel,
  localizePipelineProgress,
  pipelinePhaseLabel,
} from '../pipelineLabels.js'

describe('pipelinePhaseLabel', () => {
  it('maps known pipeline phases to Polish', () => {
    expect(pipelinePhaseLabel('distill')).toBe('destylacja')
    expect(pipelinePhaseLabel('encrypt')).toBe('szyfrowanie')
    expect(pipelinePhaseLabel('index')).toBe('indeksowanie')
    expect(pipelinePhaseLabel('embed')).toBe('embeddingi')
    expect(pipelinePhaseLabel('brain-start')).toBe('uruchamianie Brain')
    expect(pipelinePhaseLabel('doc-import')).toBe('import dokumentu')
  })

  it('passes through unknown phases', () => {
    expect(pipelinePhaseLabel('custom-phase')).toBe('custom-phase')
  })
})

describe('formatPipelineProgressLabel', () => {
  it('joins phase label and detail', () => {
    const label = formatPipelineProgressLabel(
      'distill',
      'przypomnij sobie akcje z brain vault i kontynuuj dalej',
    )
    expect(label.startsWith('destylacja · przypomnij')).toBe(true)
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThan('destylacja · przypomnij sobie akcje z brain vault i kontynuuj dalej'.length)
  })

  it('omits detail when absent', () => {
    expect(formatPipelineProgressLabel('index')).toBe('indeksowanie')
  })
})

describe('localizePipelineProgress', () => {
  it('adds label while preserving counters', () => {
    const ev = localizePipelineProgress({ phase: 'distill', done: 2, total: 5, detail: 'Chat title' })
    expect(ev.label).toBe('destylacja · Chat title')
    expect(ev.done).toBe(2)
    expect(ev.total).toBe(5)
  })
})
