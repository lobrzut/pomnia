import { describe, expect, it } from 'vitest'
import {
  distillProgressStep,
  isBrainRelatedActivity,
  particleDuration,
  planFlowVisual,
} from './flowActivity'
import type { ActivityState } from './types'

describe('flowActivity', () => {
  it('marks brain-related kinds', () => {
    expect(isBrainRelatedActivity({ kind: 'indexing' })).toBe(true)
    expect(isBrainRelatedActivity({ kind: 'distill', phase: 'reindex' })).toBe(true)
    expect(isBrainRelatedActivity({ kind: 'distill', phase: 'distill' })).toBe(false)
    expect(isBrainRelatedActivity({ kind: 'idle' })).toBe(false)
  })

  it('plans distill forward path on main line', () => {
    const plan = planFlowVisual(
      { kind: 'distill', done: 2, total: 5 },
      { demoActive: false, embeddedRunning: false, brainPipelineRunning: true },
    )
    expect(plan.forwardEdges.has('e-ai-vault')).toBe(true)
    expect(plan.forwardEdges.has('e-distill-notes')).toBe(true)
    expect(plan.dashBranches.has('main')).toBe(true)
    expect(plan.reverseAgent).toBe(false)
  })

  it('plans doc-import on orange branch', () => {
    const plan = planFlowVisual(
      { kind: 'doc-import', detail: 'book.epub' },
      { demoActive: false, embeddedRunning: false, brainPipelineRunning: false },
    )
    expect(plan.forwardEdges.has('e-import-vault')).toBe(true)
    expect(plan.forwardEdges.has('e-docs-library')).toBe(true)
    expect(plan.dashBranches.has('docs')).toBe(true)
    expect(plan.pulseNodes.has('import')).toBe(true)
  })

  it('enables reverse agent layer for indexing', () => {
    const plan = planFlowVisual(
      { kind: 'indexing', phase: 'index' },
      { demoActive: false, embeddedRunning: true, brainPipelineRunning: false },
    )
    expect(plan.reverseAgent).toBe(true)
    expect(plan.dashBranches.has('agent')).toBe(true)
    expect(plan.forwardEdges.has('e-notes-library')).toBe(true)
  })

  it('enables reverse agent path for mcp-query', () => {
    const plan = planFlowVisual(
      { kind: 'mcp-query', detail: 'vault backup' },
      { demoActive: false, embeddedRunning: false, brainPipelineRunning: false },
    )
    expect(plan.reverseAgent).toBe(true)
    expect(plan.pulseNodes.has('mcp')).toBe(true)
    expect(plan.pulseNodes.has('library')).toBe(true)
    expect(plan.agentParticlePasses).toBe(3)
  })

  it('idle with embedded brain glows library path', () => {
    const plan = planFlowVisual(
      { kind: 'idle' },
      { demoActive: false, embeddedRunning: true, brainPipelineRunning: false },
    )
    expect(plan.embeddedGlow).toBe(true)
    expect(plan.forwardEdges.size).toBe(0)
  })

  it('demo tour animates both main and docs', () => {
    const plan = planFlowVisual(
      { kind: 'idle' },
      { demoActive: true, embeddedRunning: false, brainPipelineRunning: false },
    )
    expect(plan.demoTour).toBe(true)
    expect(plan.forwardEdges.has('e-ai-vault')).toBe(true)
    expect(plan.forwardEdges.has('e-import-vault')).toBe(true)
  })

  it('speeds up particles with progress', () => {
    const slow = particleDuration({ kind: 'distill', done: 1, total: 10 }, false, false)
    const fast = particleDuration({ kind: 'distill', done: 9, total: 10 }, false, false)
    expect(fast).toBeLessThan(slow)
  })

  it('maps distill progress to main-path step', () => {
    const state: ActivityState = { kind: 'distill', done: 3, total: 7 }
    expect(distillProgressStep(state)).toBe(2)
  })
})
