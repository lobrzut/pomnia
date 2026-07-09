import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  CloudUpload,
  Database,
  FileText,
  HardDriveDownload,
  Layers,
  Plug,
  Search,
  Sparkles,
  Wand2
} from 'lucide-react'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { uiLabels } from '../lib/labels'
import type { UiLabels } from '../lib/labels'
import type { Route } from '../store/useStore'

const SLAVIC_GREEN = '#1a5c3a'
const DOCS_ORANGE = '#fb923c'
const AMBER = '#fbbf24'
/** SVG viewBox height — keep in sync with node y% (y% = y / VIEWBOX_H * 100). */
const VIEWBOX_H = 280
const FLOW_MAIN_Y = 95
const FLOW_RETURN_Y = 118
/** Horizontal corridor for docs/optional connectors — below main subtitles, above docs icons. */
const FLOW_ROUTE_Y = 175
const FLOW_DOCS_Y = 246
/** Vertical corridor for agent-layer sidecar — between main line and docs branch. */
const FLOW_AGENT_Y = 158
const FLOW_AGENT_JUNCTION_Y = 132

export interface FlowDiagramProps {
  variant?: 'full' | 'mini'
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
  const mainY = mini ? 36 : 34
  const branchY = mini ? 90 : 88
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
      x: 71,
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
      x: 93,
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
      x: 93,
      y: branchY,
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
    { id: 'e-notes-library', d: `M ${sx(55)} ${my} L ${sx(71)} ${my}`, branch: 'main', particleDelay: 0.75 },
    { id: 'e-library-mcp', d: `M ${sx(71)} ${my} L ${sx(93)} ${my}`, branch: 'main', particleDelay: 1 },
    {
      id: 'e-library-mcp-return',
      d: `M ${sx(71)} ${ry} L ${sx(93)} ${ry}`,
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
      d: `M ${sx(55)} ${by} L ${sx(55)} ${j} L ${sx(71)} ${j} L ${sx(71)} ${my}`,
      branch: 'docs',
      particleDelay: 0.75
    },
    { id: 'e-library-deploy', d: `M ${sx(71)} ${my} L ${sx(71)} ${by} L ${sx(93)} ${by}`, branch: 'optional', particleDelay: 1.4 }
  ]
}

function buildAgentEdges(): FlowEdge[] {
  const my = FLOW_MAIN_Y
  const ay = FLOW_AGENT_Y
  const jy = FLOW_AGENT_JUNCTION_Y
  const libX = sx(71)
  const agentX = sx(84)
  const mcpX = sx(93)
  return [
    {
      id: 'e-library-agent',
      d: `M ${libX} ${my} L ${libX} ${jy} L ${agentX} ${jy} L ${agentX} ${ay}`,
      branch: 'agent'
    },
    {
      id: 'e-agent-mcp',
      d: `M ${agentX} ${ay} L ${agentX} ${jy} L ${mcpX} ${jy} L ${mcpX} ${my}`,
      branch: 'agent'
    }
  ]
}

function edgeClass(branch: FlowEdge['branch']): string {
  if (branch === 'docs') return 'flow-path flow-path-docs'
  if (branch === 'optional') return 'flow-path flow-path-optional'
  if (branch === 'return') return 'flow-path flow-path-return'
  if (branch === 'agent') return 'flow-path flow-path-agent'
  return 'flow-path flow-path-main'
}

function FlowNode({
  node,
  active,
  mini,
  onNavigate
}: {
  node: FlowNodeDef
  active: boolean
  mini: boolean
  onNavigate?: (route: Route) => void
}) {
  const Icon = node.icon
  const clickable = Boolean(node.route && onNavigate)

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
        node.branch === 'optional' && 'flow-node--optional',
        node.branch === 'docs' && 'flow-node--docs',
        mini ? 'w-[68px]' : 'w-[112px]'
      )}
      style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div
        className={clsx(
          'relative z-10 flex items-center justify-center rounded-xl border',
          mini ? 'h-7 w-7' : 'h-11 w-11',
          active && 'border-amber/60',
          !active && node.branch === 'main' && 'border-[#1a5c3a66]',
          !active && node.branch === 'docs' && 'border-[#fb923c44]',
          !active && node.branch === 'optional' && 'border-dashed border-amber/30'
        )}
        style={{
          background: node.branch === 'main' ? `${SLAVIC_GREEN}33` : node.branch === 'docs' ? `${DOCS_ORANGE}22` : `${AMBER}15`
        }}
      >
        <Icon
          className={mini ? 'h-3 w-3' : 'h-4 w-4'}
          style={{ color: node.branch === 'main' ? '#34d399' : node.branch === 'docs' ? DOCS_ORANGE : AMBER }}
        />
      </div>
      <span
        className={clsx(
          'relative z-20 mt-2 rounded-md bg-[#06070d]/90 px-1.5 py-0.5 font-semibold leading-tight text-ink backdrop-blur-sm',
          mini ? 'text-[8px]' : 'text-[11px]'
        )}
      >
        {node.label}
      </span>
      {!mini && (
        <span className="relative z-20 mt-1 max-w-[108px] truncate rounded-md bg-[#06070d]/95 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint backdrop-blur-sm">
          {node.disk}
        </span>
      )}
    </button>
  )
}

function AgentLayerSidecar({ labels }: { labels: UiLabels }) {
  return (
    <div
      className="pointer-events-none absolute z-30 w-[148px]"
      style={{ left: '84%', top: `${(FLOW_AGENT_Y / VIEWBOX_H) * 100}%`, transform: 'translate(-50%, -42%)' }}
    >
      <div className="rounded-xl border border-dashed border-iris/45 bg-[#080c18]/95 px-2.5 py-2 shadow-lg shadow-black/40 backdrop-blur-sm">
        <p className="mb-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-iris">
          {labels.flowAgentLayerTitle}
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-start gap-1.5">
            <Wand2 className="mt-0.5 h-3 w-3 shrink-0 text-iris/80" />
            <div className="min-w-0 text-left">
              <span className="block text-[10px] font-semibold leading-tight text-ink">{labels.flowAgentLayerSkills}</span>
              <span className="block font-mono text-[8px] leading-snug text-ink-faint">{labels.flowAgentLayerSkillsDetail}</span>
            </div>
          </li>
          <li className="flex items-start gap-1.5">
            <Search className="mt-0.5 h-3 w-3 shrink-0 text-cyan/80" />
            <div className="min-w-0 text-left">
              <span className="block text-[10px] font-semibold leading-tight text-ink">{labels.flowAgentLayerSearch}</span>
              <span className="block font-mono text-[8px] leading-snug text-ink-faint">{labels.flowAgentLayerSearchDetail}</span>
            </div>
          </li>
        </ul>
        <p className="mt-2 border-t border-white/6 pt-1.5 text-center text-[8px] italic leading-snug text-ink-faint">
          {labels.flowAgentLayerCaption}
        </p>
      </div>
    </div>
  )
}

export function FlowDiagram({ variant = 'full', animKey = 0, onNavigate, className }: FlowDiagramProps) {
  const labels = uiLabels()
  const mini = variant === 'mini'
  const nodes = useMemo(() => buildNodes(labels, mini), [labels, mini])
  const edges = useMemo(() => buildEdges(labels.flowEdgeMemoryReturn), [labels.flowEdgeMemoryReturn])
  const agentEdges = useMemo(() => buildAgentEdges(), [])
  const [activeStep, setActiveStep] = useState(-1)
  const [hoverId, setHoverId] = useState<string | null>(null)

  useEffect(() => {
    setActiveStep(-1)
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i <= 5; i++) {
      timers.push(setTimeout(() => setActiveStep(i), 350 + i * 600))
    }
    timers.push(setTimeout(() => setActiveStep(-1), 350 + 6 * 600 + 1000))
    return () => timers.forEach(clearTimeout)
  }, [animKey, mini])

  const hint =
    hoverId != null
      ? (nodes.find((n) => n.id === hoverId)?.hint ?? labels.guideLead)
      : activeStep >= 0
        ? (nodes.find((n) => n.step === activeStep)?.hint ?? labels.guideLead)
        : labels.guideLead

  return (
    <div
      className={clsx(
        'flow-diagram overflow-hidden rounded-2xl border border-white/8',
        mini ? 'bg-black/25' : 'bg-gradient-to-b from-[#06070d] to-[#0a1210]',
        className
      )}
      onMouseLeave={() => setHoverId(null)}
    >
      <div className={clsx('relative w-full', mini ? 'h-[140px]' : 'h-[280px]')}>
        {!mini && (
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: `radial-gradient(ellipse 80% 60% at 50% 35%, ${SLAVIC_GREEN}44, transparent 70%)` }}
          />
        )}

        <svg
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
          {edges.map((edge) => (
            <g key={edge.id}>
              <path d={edge.d} className={edgeClass(edge.branch)} fill="none" markerEnd={edge.branch === 'return' ? 'url(#flow-arrow-return)' : undefined} />
              {edge.label && !mini && (
                <text
                  x={(sx(71) + sx(93)) / 2}
                  y={FLOW_RETURN_Y + 16}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  opacity="0.55"
                >
                  {edge.label}
                </text>
              )}
              {edge.branch !== 'return' && (
                <circle
                  r={mini ? 2 : 3}
                  className={
                    edge.branch === 'docs' ? 'flow-particle-docs' : edge.branch === 'optional' ? 'flow-particle-optional' : 'flow-particle-main'
                  }
                  filter={mini ? undefined : 'url(#flow-glow)'}
                  opacity={mini ? 0.5 : 1}
                >
                  <animateMotion
                    dur={`${mini ? 3.2 : 2.4}s`}
                    repeatCount="indefinite"
                    path={edge.d}
                    begin={`${edge.particleDelay ?? 0}s`}
                  />
                </circle>
              )}
            </g>
          ))}
          {!mini &&
            agentEdges.map((edge) => (
              <path
                key={edge.id}
                d={edge.d}
                className={edgeClass(edge.branch)}
                fill="none"
                markerEnd="url(#flow-arrow-agent)"
              />
            ))}
        </svg>

        {!mini && <AgentLayerSidecar labels={labels} />}

        {nodes.map((node) => (
          <div key={node.id} onMouseEnter={() => setHoverId(node.id)}>
            <FlowNode node={node} mini={mini} onNavigate={onNavigate} active={activeStep >= 0 && node.step === activeStep} />
          </div>
        ))}
      </div>

      {!mini && (
        <div className="border-t border-white/6 bg-black/30 px-4 py-3">
          <p className="min-h-[2.5rem] text-center text-xs leading-relaxed text-ink-dim">{hint}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
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
