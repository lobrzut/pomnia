import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, CloudUpload, Database, FileText, HardDriveDownload, Layers, Plug, Search, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { api } from '../lib/api'
import {
  distillProgressStep,
  particleDuration,
  planFlowVisual
} from '../lib/flowActivity'
import { uiLabels } from '../lib/labels'
import type { UiLabels } from '../lib/labels'
import { useStore, type Route } from '../store/useStore'

const SLAVIC_GREEN = '#1a5c3a'
const DOCS_ORANGE = '#fb923c'
const AMBER = '#fbbf24'
/** SVG viewBox height — keep in sync with node y% (y% = y / VIEWBOX_H * 100). */
const VIEWBOX_H = 360
const FLOW_MAIN_Y = 92
const FLOW_RETURN_Y = 106
/** Horizontal corridor for docs/optional connectors — below main subtitles, above docs icons. */
const FLOW_ROUTE_Y = 218
const FLOW_DOCS_Y = 300
const FLOW_DEPLOY_Y = 316
/** Horizontal corridor for agent query path — between main line and docs branch. */
const FLOW_AGENT_JUNCTION_Y = 148
/** Pill between library and MCP — above blue agent path, clear of MCP title. */
const FLOW_MEMORY_LABEL_Y = 118
/** Main-row x positions (%). Wider gap library ↔ MCP reduces label overlap. */
const FLOW_LIBRARY_X = 70
const FLOW_MCP_X = 97

export interface FlowDiagramProps {
  variant?: 'full' | 'mini'
  /** Increment to replay onboarding demo tour (manual only). */
  animKey?: number
  onNavigate?: (route: Route) => void
  className?: string
}

interface FlowNodeDef {
  id: string
  x: number
  y: number
  icon: LucideIcon
  label: string
  hint: string
  disk: string
  route?: Route
  branch: 'main' | 'docs' | 'optional'
  step?: number
}

interface FlowEdge {
  id: string
  d: string
  branch: 'main' | 'docs' | 'optional' | 'return' | 'agent'
  particleDelay?: number
  label?: string
}

/** Map horizontal % to SVG viewBox x (0–1000). */
function sx(pct: number): number {
  return (pct / 100) * 1000
}

function buildNodes(L: ReturnType<typeof uiLabels>, mini: boolean): FlowNodeDef[] {
  const mainY = mini ? 36 : Math.round((FLOW_MAIN_Y / VIEWBOX_H) * 100)
  const branchY = mini ? 90 : Math.round((FLOW_DOCS_Y / VIEWBOX_H) * 100)
  const deployY = mini ? 94 : Math.round((FLOW_DEPLOY_Y / VIEWBOX_H) * 100)
  return [
    {
      id: 'ai',
      x: 7,
      y: mainY,
      icon: Bot,
      label: L.flowNodeAiLabel,
      hint: L.flowNodeAiHint,
      disk: L.flowNodeAiDisk,
      route: 'dashboard',
      branch: 'main',
      step: 0
    },
    {
      id: 'vault',
      x: 23,
      y: mainY,
      icon: Database,
      label: L.flowNodeVaultLabel,
      hint: L.flowNodeVaultHint,
      disk: L.flowNodeVaultDisk,
      route: 'settings',
      branch: 'main',
      step: 1
    },
    {
      id: 'distill',
      x: 39,
      y: mainY,
      icon: Sparkles,
      label: L.flowNodeDistillLabel,
      hint: L.flowNodeDistillHint,
      disk: L.flowNodeDistillDisk,
      route: 'brain',
      branch: 'main',
      step: 2
    },
    {
      id: 'notes',
      x: 55,
      y: mainY,
      icon: HardDriveDownload,
      label: L.flowNodeNotesLabel,
      hint: L.flowNodeNotesHint,
      disk: L.flowNodeNotesDisk,
      route: 'brain',
      branch: 'main',
      step: 3
    },
    {
      id: 'library',
      x: FLOW_LIBRARY_X,
      y: mainY,
      icon: Layers,
      label: L.flowNodeLibraryLabel,
      hint: L.flowNodeLibraryHint,
      disk: L.flowNodeLibraryDisk,
      route: 'brain',
      branch: 'main',
      step: 4
    },
    {
      id: 'mcp',
      x: FLOW_MCP_X,
      y: mainY,
      icon: Plug,
      label: L.flowNodeMcpLabel,
      hint: L.flowNodeMcpHint,
      disk: L.flowNodeMcpDisk,
      route: 'connect',
      branch: 'main',
      step: 5
    },
    {
      id: 'import',
      x: 7,
      y: branchY,
      icon: FileText,
      label: L.flowNodeImportLabel,
      hint: L.flowNodeImportHint,
      disk: L.flowNodeImportDisk,
      route: 'import',
      branch: 'docs',
      step: 1
    },
    {
      id: 'docs-index',
      x: 55,
      y: branchY,
      icon: Search,
      label: L.flowNodeDocsIndexLabel,
      hint: L.flowNodeDocsIndexHint,
      disk: L.flowNodeDocsIndexDisk,
      route: 'brain',
      branch: 'docs',
      step: 4
    },
    {
      id: 'deploy',
      x: 96,
      y: deployY,
      icon: CloudUpload,
      label: L.flowNodeDeployLabel,
      hint: L.flowNodeDeployHint,
      disk: L.flowNodeDeployDisk,
      route: 'brain',
      branch: 'optional'
    }
  ]
}

function buildEdges(memoryReturnLabel: string): FlowEdge[] {
  const my = FLOW_MAIN_Y
  const by = FLOW_DOCS_Y
  const j = FLOW_ROUTE_Y
  const ry = FLOW_RETURN_Y
  return [
    { id: 'e-ai-vault', d: `M ${sx(7)} ${my} L ${sx(23)} ${my}`, branch: 'main', particleDelay: 0 },
    { id: 'e-vault-distill', d: `M ${sx(23)} ${my} L ${sx(39)} ${my}`, branch: 'main', particleDelay: 0.25 },
    { id: 'e-distill-notes', d: `M ${sx(39)} ${my} L ${sx(55)} ${my}`, branch: 'main', particleDelay: 0.5 },
    { id: 'e-notes-library', d: `M ${sx(55)} ${my} L ${sx(FLOW_LIBRARY_X)} ${my}`, branch: 'main', particleDelay: 0.75 },
    { id: 'e-library-mcp', d: `M ${sx(FLOW_LIBRARY_X)} ${my} L ${sx(FLOW_MCP_X)} ${my}`, branch: 'main', particleDelay: 1 },
    {
      id: 'e-library-mcp-return',
      d: `M ${sx(FLOW_LIBRARY_X)} ${ry} L ${sx(FLOW_MCP_X)} ${ry}`,
      branch: 'return',
      label: memoryReturnLabel
    },
    {
      id: 'e-import-vault',
      d: `M ${sx(7)} ${by} L ${sx(7)} ${j} L ${sx(23)} ${j} L ${sx(23)} ${my}`,
      branch: 'docs',
      particleDelay: 0.15
    },
    { id: 'e-vault-docs', d: `M ${sx(23)} ${my} L ${sx(23)} ${by} L ${sx(55)} ${by}`, branch: 'docs', particleDelay: 0.45 },
    {
      id: 'e-docs-library',
      d: `M ${sx(55)} ${by} L ${sx(55)} ${j} L ${sx(FLOW_LIBRARY_X)} ${j} L ${sx(FLOW_LIBRARY_X)} ${my}`,
      branch: 'docs',
      particleDelay: 0.75
    },
    {
      id: 'e-library-deploy',
      d: `M ${sx(FLOW_LIBRARY_X)} ${my} L ${sx(FLOW_LIBRARY_X)} ${FLOW_DEPLOY_Y} L ${sx(96)} ${FLOW_DEPLOY_Y}`,
      branch: 'optional',
      particleDelay: 1.4
    }
  ]
}

function buildAgentEdges(): FlowEdge[] {
  const my = FLOW_MAIN_Y
  const jy = FLOW_AGENT_JUNCTION_Y
  const libX = sx(FLOW_LIBRARY_X)
  const mcpX = sx(FLOW_MCP_X)
  return [
    {
      id: 'e-library-mcp-query',
      d: `M ${libX} ${my} L ${libX} ${jy} L ${mcpX} ${jy} L ${mcpX} ${my}`,
      branch: 'agent',
      particleDelay: 0,
    },
  ]
}

function edgeClass(branch: FlowEdge['branch'], dashLive: boolean): string {
  const base =
    branch === 'docs'
      ? 'flow-path flow-path-docs'
      : branch === 'optional'
        ? 'flow-path flow-path-optional'
        : branch === 'return'
          ? 'flow-path flow-path-return'
          : branch === 'agent'
            ? 'flow-path flow-path-agent'
            : 'flow-path flow-path-main'
  return dashLive ? `${base} flow-path--dash-live` : base
}

function FlowNode({
  node,
  active,
  pulsing,
  embeddedGlow,
  mini,
  onNavigate,
  labels,
}: {
  node: FlowNodeDef
  active: boolean
  pulsing: boolean
  embeddedGlow: boolean
  mini: boolean
  onNavigate?: (route: Route) => void
  labels?: UiLabels
}) {
  const Icon = node.icon
  const clickable = Boolean(node.route && onNavigate)
  const isMcp = node.id === 'mcp' && !mini && labels

  return (
    <button
      type="button"
      title={node.hint}
      disabled={!clickable}
      onClick={() => node.route && onNavigate?.(node.route)}
      className={clsx(
        'flow-node no-drag absolute z-20 flex flex-col items-center text-center transition-transform',
        clickable && 'cursor-pointer hover:scale-[1.04]',
        !clickable && 'cursor-default',
        active && 'flow-node--active',
        pulsing && 'flow-node--pulse',
        embeddedGlow && 'flow-node--embedded',
        isMcp && 'flow-node--mcp',
        node.branch === 'optional' && 'flow-node--optional',
        node.branch === 'docs' && 'flow-node--docs',
        mini ? 'w-[68px]' : isMcp ? 'w-[124px]' : 'w-[108px]',
      )}
      style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {isMcp && labels ? (
        <div
          className={clsx(
            'relative z-10 flex w-full flex-col items-center gap-1.5 rounded-xl border px-2.5 py-2.5',
            active && 'border-amber/60',
            !active && 'border-iris/35',
          )}
          style={{
            background: 'linear-gradient(180deg, #818cf818 0%, #06070dcc 100%)',
          }}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-iris/25 bg-black/30">
            <Icon className="h-4 w-4" style={{ color: '#a5b4fc' }} />
          </div>
          <span className="w-full text-[11px] font-semibold leading-tight text-ink">{node.label}</span>
          <span className="w-full font-mono text-[8px] leading-tight text-iris/80">
            {labels.flowAgentLayerSkills}
            <span className="text-ink-faint"> · </span>
            <span className="text-cyan/90">{labels.flowAgentLayerSearch}</span>
          </span>
          <span className="w-full border-t border-white/8 pt-1.5 font-mono text-[8px] leading-snug text-ink-faint">
            {node.disk}
          </span>
        </div>
      ) : (
        <>
          <div
            className={clsx(
              'relative z-10 flex flex-col items-center rounded-xl border',
              mini ? 'h-7 w-7 items-center justify-center' : 'h-11 w-11 items-center justify-center',
              active && 'border-amber/60',
              !active && node.branch === 'main' && 'border-[#1a5c3a66]',
              !active && node.branch === 'docs' && 'border-[#fb923c44]',
              !active && node.branch === 'optional' && 'border-dashed border-amber/30',
            )}
            style={{
              background:
                node.branch === 'main'
                  ? `${SLAVIC_GREEN}33`
                  : node.branch === 'docs'
                    ? `${DOCS_ORANGE}22`
                    : `${AMBER}15`,
            }}
          >
            <div className={clsx('flex items-center justify-center', !mini && 'h-full w-full')}>
              <Icon
                className={mini ? 'h-3 w-3' : 'h-4 w-4'}
                style={{
                  color:
                    node.branch === 'main' ? '#34d399' : node.branch === 'docs' ? DOCS_ORANGE : AMBER,
                }}
              />
            </div>
          </div>
          <span
            className={clsx(
              'relative z-20 mt-2 rounded-md bg-[#06070d]/90 px-1.5 py-0.5 font-semibold leading-tight text-ink backdrop-blur-sm',
              mini ? 'text-[8px]' : 'text-[11px]',
            )}
          >
            {node.label}
          </span>
          {!mini && (
            <span className="relative z-20 mt-1 max-w-[108px] line-clamp-2 rounded-md bg-[#06070d]/95 px-1.5 py-0.5 text-center font-mono text-[8px] leading-snug text-ink-faint backdrop-blur-sm">
              {node.disk}
            </span>
          )}
        </>
      )}
    </button>
  )
}

function FlowParticle({
  edge,
  reverse,
  dur,
  mini,
  passIndex = 0,
}: {
  edge: FlowEdge
  reverse?: boolean
  dur: number
  mini: boolean
  passIndex?: number
}) {
  const particleClass =
    edge.branch === 'agent'
      ? 'flow-particle-agent'
      : edge.branch === 'docs'
        ? 'flow-particle-docs'
        : edge.branch === 'optional'
          ? 'flow-particle-optional'
          : 'flow-particle-main'

  const stagger = passIndex * (dur / 3.2)

  return (
    <circle
      r={mini ? 2 : edge.branch === 'agent' ? 3.5 : 3}
      className={particleClass}
      filter={mini ? undefined : 'url(#flow-glow)'}
      opacity={mini ? 0.55 : edge.branch === 'agent' ? 1 : 1}
    >
      <animateMotion
        dur={`${dur}s`}
        repeatCount="indefinite"
        path={edge.d}
        begin={`${(edge.particleDelay ?? 0) + stagger}s`}
        keyPoints={reverse ? '1;0' : '0;1'}
        keyTimes="0;1"
        calcMode="linear"
      />
    </circle>
  )
}


export function FlowDiagram({ variant = 'full', animKey = 0, onNavigate, className }: FlowDiagramProps) {
  const labels = uiLabels()
  const mini = variant === 'mini'
  const nodes = useMemo(() => buildNodes(labels, mini), [labels, mini])
  const edges = useMemo(() => buildEdges(labels.flowEdgeMemoryReturn), [labels.flowEdgeMemoryReturn])
  const agentEdges = useMemo(() => buildAgentEdges(), [])
  const globalActivity = useStore((s) => s.globalActivity)
  const brainRunning = useStore((s) => s.brainRunning)
  const isBusy = globalActivity.kind !== 'idle'
  const [demoStep, setDemoStep] = useState(-1)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [embeddedRunning, setEmbeddedRunning] = useState(false)
  const [lastMcpVisible, setLastMcpVisible] = useState(false)
  const [lastMcpTool, setLastMcpTool] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)
  const prevAnimKey = useRef(animKey)
  const lastMcpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const demoActive = demoStep >= 0
  const visual = useMemo(
    () =>
      planFlowVisual(globalActivity, {
        demoActive,
        embeddedRunning,
        brainPipelineRunning: brainRunning
      }),
    [globalActivity, demoActive, embeddedRunning, brainRunning]
  )

  const flowLive = isBusy || demoActive
  const isMcpQuery = globalActivity.kind === 'mcp-query'
  const particleDur = particleDuration(globalActivity, mini, demoActive)
  const agentPasses = visual.agentParticlePasses
  const progressStep = isBusy && globalActivity.kind === 'distill' ? distillProgressStep(globalActivity) : undefined

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (flowLive) svg.unpauseAnimations()
    else svg.pauseAnimations()
  }, [flowLive])

  useEffect(() => {
    if (globalActivity.kind !== 'mcp-query') return
    const tool = globalActivity.phase ?? globalActivity.detail ?? 'MCP'
    setLastMcpTool(tool)
    setLastMcpVisible(true)
    if (lastMcpTimer.current) clearTimeout(lastMcpTimer.current)
    lastMcpTimer.current = setTimeout(() => {
      setLastMcpVisible(false)
      lastMcpTimer.current = null
    }, 10_000)
    return () => {
      if (lastMcpTimer.current) clearTimeout(lastMcpTimer.current)
    }
  }, [globalActivity])

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void api.brainCoreStatus().then((s) => {
        if (!cancelled) setEmbeddedRunning(s.running)
      })
    }
    refresh()
    const id = setInterval(refresh, 20_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (animKey === prevAnimKey.current) return
    prevAnimKey.current = animKey
    if (animKey === 0) return

    setDemoStep(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= 5; i++) {
      timers.push(setTimeout(() => setDemoStep(i), 350 + i * 600))
    }
    timers.push(setTimeout(() => setDemoStep(-1), 350 + 6 * 600 + 1000))
    return () => timers.forEach(clearTimeout)
  }, [animKey])

  const hint =
    hoverId != null
      ? (nodes.find((n) => n.id === hoverId)?.hint ?? labels.guideLead)
      : demoActive
        ? (nodes.find((n) => n.step === demoStep)?.hint ?? labels.guideLead)
        : isBusy && globalActivity.detail
          ? globalActivity.detail
          : labels.guideLead

  const showWaitingCaption = !flowLive && !hoverId

  return (
    <div
      className={clsx(
        'flow-diagram overflow-hidden rounded-2xl border border-white/8',
        mini ? 'bg-black/25' : 'bg-gradient-to-b from-[#06070d] to-[#0a1210]',
        flowLive && 'flow-diagram--live',
        isBusy && 'flow-diagram--busy',
        isMcpQuery && 'flow-diagram--mcp-query',
        !flowLive && visual.embeddedGlow && 'flow-diagram--embedded-idle',
        !flowLive && !visual.embeddedGlow && 'flow-diagram--idle',
        className
      )}
    >
      {lastMcpVisible && !mini && (
        <div
          className="absolute left-3 top-3 z-40 flex items-center gap-1.5 rounded-full border border-iris/40 bg-[#06070d]/95 px-2.5 py-1 text-[10px] shadow-lg backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <Plug className="h-3 w-3 text-iris" aria-hidden />
          <span className="font-medium text-iris/90">{labels.flowLastMcpBadge(lastMcpTool)}</span>
        </div>
      )}

      {isBusy && (
        <div
          className={clsx(
            'absolute z-40 flex items-center gap-1.5 rounded-full border border-emerald/35 bg-[#06070d]/92 px-2.5 py-1 shadow-lg backdrop-blur-sm',
            mini ? 'left-2 top-2 text-[8px]' : 'right-3 top-3 text-[10px]'
          )}
          role="status"
          aria-live="polite"
        >
          <span className="flow-live-dot" aria-hidden />
          <span className="font-semibold text-emerald">{labels.flowLiveBadge(globalActivity)}</span>
        </div>
      )}

      <div className={clsx('relative w-full', mini ? 'h-[140px]' : 'h-[360px]')}>
        {!mini && (
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: `radial-gradient(ellipse 80% 60% at 50% 35%, ${SLAVIC_GREEN}44, transparent 70%)` }}
          />
        )}

        <svg
          ref={svgRef}
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox={`0 0 1000 ${VIEWBOX_H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <filter id="flow-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker id="flow-arrow-return" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#34d399" opacity="0.45" />
            </marker>
            <marker id="flow-arrow-agent" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#818cf8" opacity="0.55" />
            </marker>
          </defs>
          {edges.map((edge) => {
            const dashLive = visual.dashBranches.has(edge.branch as 'main' | 'docs' | 'optional')
            const showForward = visual.forwardEdges.has(edge.id)
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  className={edgeClass(edge.branch, dashLive)}
                  fill="none"
                  markerEnd={edge.branch === 'return' ? 'url(#flow-arrow-return)' : undefined}
                />
                {showForward && <FlowParticle edge={edge} dur={particleDur} mini={mini} />}
              </g>
            )
          })}
          {agentEdges.map((edge) => {
            const dashLive = visual.dashBranches.has('agent')
            const showReverse = visual.reverseAgent
            return (
              <g key={edge.id}>
                <path
                  d={edge.d}
                  className={edgeClass(edge.branch, dashLive)}
                  fill="none"
                  markerEnd={showReverse ? 'url(#flow-arrow-agent)' : undefined}
                />
                {showReverse &&
                  Array.from({ length: agentPasses }, (_, i) => (
                    <FlowParticle
                      key={`${edge.id}-p${i}`}
                      edge={edge}
                      reverse
                      dur={particleDur * 1.1}
                      mini={mini}
                      passIndex={i}
                    />
                  ))}
              </g>
            )
          })}
        </svg>

        {!mini && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-emerald/30 bg-[#06070d] px-2.5 py-1 text-[9px] font-semibold text-emerald/80 shadow-md"
            style={{
              left: `${(FLOW_LIBRARY_X + FLOW_MCP_X) / 2}%`,
              top: `${(FLOW_MEMORY_LABEL_Y / VIEWBOX_H) * 100}%`,
            }}
          >
            {labels.flowEdgeMemoryReturn}
          </div>
        )}

        {nodes.map((node) => {
          const demoHighlight = demoActive && node.step === demoStep
          const livePulse = visual.pulseNodes.has(node.id)
          const progressHighlight = progressStep != null && node.step === progressStep
          const embeddedGlow =
            visual.embeddedGlow && (node.id === 'library' || node.id === 'mcp')
          return (
            <div key={node.id} onMouseEnter={() => setHoverId(node.id)}>
              <FlowNode
                node={node}
                mini={mini}
                labels={labels}
                onNavigate={onNavigate}
                active={demoHighlight || progressHighlight}
                pulsing={livePulse}
                embeddedGlow={embeddedGlow}
              />
            </div>
          )
        })}
      </div>

      {!mini && (
        <div className="border-t border-white/6 bg-black/30 px-4 py-2.5">
          <p className="min-h-[2rem] text-center text-xs leading-relaxed text-ink-dim">{hint}</p>
          {showWaitingCaption && (
            <p className="mt-0.5 text-center text-[10px] italic text-ink-faint">{labels.flowWaitingCaption}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[9px] font-medium uppercase tracking-wider text-ink-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full" style={{ background: SLAVIC_GREEN }} />
              {labels.guideFlowMainLegend}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full bg-[#fb923c]" />
              {labels.guideFlowDocsLegend}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full border border-dashed border-amber/60" />
              {labels.guideFlowOptionalLegend}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1 w-4 rounded-full border border-dashed border-iris/60" />
              {labels.guideFlowAgentLegend}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

