import type { ActivityKind, ActivityState } from './types'

/** Edge ids from FlowDiagram.buildEdges / buildAgentEdges */
export const FLOW_MAIN_EDGES = [
  'e-ai-vault',
  'e-vault-distill',
  'e-distill-notes',
  'e-notes-library',
  'e-library-mcp',
] as const

export const FLOW_DOCS_EDGES = ['e-import-vault', 'e-vault-docs', 'e-docs-library'] as const

export const FLOW_AGENT_EDGES = ['e-library-mcp-query'] as const

const BRAIN_ACTIVITY: ReadonlySet<ActivityKind> = new Set(['brain-start', 'indexing', 'embed'])

export function isBrainRelatedActivity(state: ActivityState): boolean {
  if (state.kind === 'idle') return false
  if (BRAIN_ACTIVITY.has(state.kind)) return true
  return state.kind === 'distill' && state.phase === 'reindex'
}

export function activityProgressRatio(state: ActivityState): number | undefined {
  if (state.done == null || state.total == null || state.total <= 0) return undefined
  return Math.min(1, state.done / state.total)
}

/** Main-path step 0–4 for distill progress highlight */
export function distillProgressStep(state: ActivityState): number | undefined {
  const ratio = activityProgressRatio(state)
  if (ratio == null) return undefined
  return Math.min(4, Math.floor(ratio * 5))
}

export function particleDuration(
  state: ActivityState,
  mini: boolean,
  demo: boolean,
): number {
  const idleBase = mini ? 3.2 : 2.4
  const liveBase = mini ? 2.2 : 1.5
  if (demo) return idleBase
  const ratio = activityProgressRatio(state)
  if (ratio == null) return liveBase
  return liveBase * (1.55 - ratio * 0.65)
}

export interface FlowVisualPlan {
  forwardEdges: ReadonlySet<string>
  reverseAgent: boolean
  pulseNodes: ReadonlySet<string>
  dashBranches: ReadonlySet<'main' | 'docs' | 'optional' | 'agent'>
  embeddedGlow: boolean
  demoTour: boolean
  /** Particle count on agent reverse path (mcp-query uses 3). */
  agentParticlePasses: number
}

const DEMO_FORWARD = new Set([...FLOW_MAIN_EDGES.slice(0, 4), ...FLOW_DOCS_EDGES])

export function planFlowVisual(
  activity: ActivityState,
  opts: { demoActive: boolean; embeddedRunning: boolean; brainPipelineRunning: boolean },
): FlowVisualPlan {
  if (opts.demoActive) {
    return {
      forwardEdges: DEMO_FORWARD,
      reverseAgent: false,
      pulseNodes: new Set<string>(),
      dashBranches: new Set(['main', 'docs']),
      embeddedGlow: false,
      demoTour: true,
      agentParticlePasses: 0,
    }
  }

  if (activity.kind === 'idle') {
    return {
      forwardEdges: new Set<string>(),
      reverseAgent: false,
      pulseNodes: new Set<string>(),
      dashBranches: new Set(),
      embeddedGlow: opts.embeddedRunning,
      demoTour: false,
      agentParticlePasses: 0,
    }
  }

  const forward = new Set<string>()
  const pulse = new Set<string>()
  const dash = new Set<'main' | 'docs' | 'optional' | 'agent'>()
  let reverseAgent = false
  let agentParticlePasses = 0

  switch (activity.kind) {
    case 'distill':
      for (const id of FLOW_MAIN_EDGES.slice(0, 4)) forward.add(id)
      pulse.add('ai')
      pulse.add('vault')
      pulse.add('distill')
      pulse.add('notes')
      dash.add('main')
      if (activity.phase === 'reindex') {
        forward.add('e-notes-library')
        pulse.add('library')
        reverseAgent = true
        dash.add('agent')
      }
      break
    case 'doc-import':
      for (const id of FLOW_DOCS_EDGES) forward.add(id)
      pulse.add('import')
      pulse.add('vault')
      pulse.add('docs-index')
      dash.add('docs')
      break
    case 'indexing':
    case 'embed':
      forward.add('e-distill-notes')
      forward.add('e-notes-library')
      forward.add('e-docs-library')
      pulse.add('notes')
      pulse.add('docs-index')
      pulse.add('library')
      dash.add('main')
      dash.add('docs')
      reverseAgent = true
      dash.add('agent')
      break
    case 'brain-start':
      pulse.add('library')
      pulse.add('distill')
      dash.add('main')
      reverseAgent = opts.brainPipelineRunning || opts.embeddedRunning
      if (reverseAgent) dash.add('agent')
      break
    case 'mcp-query':
      reverseAgent = true
      dash.add('agent')
      pulse.add('library')
      pulse.add('mcp')
      agentParticlePasses = 3
      break
    default:
      break
  }

  if (isBrainRelatedActivity(activity) && opts.embeddedRunning) {
    reverseAgent = true
    dash.add('agent')
    pulse.add('library')
    pulse.add('mcp')
    if (agentParticlePasses === 0) agentParticlePasses = 1
  }

  return {
    forwardEdges: forward,
    reverseAgent,
    pulseNodes: pulse,
    dashBranches: dash,
    embeddedGlow: false,
    demoTour: false,
    agentParticlePasses: reverseAgent ? Math.max(agentParticlePasses, 1) : 0,
  }
}
