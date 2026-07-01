/**
 * Per-client brand marks for the Connect flow.
 *
 * These are simplified, original geometric interpretations rendered in a single
 * monoline style — recognizable at a glance, not pixel-exact logo copies. Each
 * tile tints itself with the client's brand color.
 */
import type { ReactNode } from 'react'
import type { ClientId } from '../lib/types'

export const CLIENT_BRAND: Record<ClientId, { color: string; tagline: string }> = {
  'claude-code': { color: '#d97757', tagline: 'CLI in your terminal' },
  cursor: { color: '#cbd5e1', tagline: 'AI-first editor' },
  antigravity: { color: '#4285f4', tagline: 'Google agentic IDE' },
  'claude-desktop': { color: '#c08a5a', tagline: 'Desktop app' },
  vscode: { color: '#3aa0ff', tagline: 'Native MCP (1.103+)' },
  windsurf: { color: '#10b6a2', tagline: 'Codeium Cascade' },
  hermes: { color: '#f0b429', tagline: 'Nous Research agent' }
}

// 12-ray sunburst — shared by both Claude clients.
const claudeBurst: ReactNode = (
  <g stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
    {Array.from({ length: 12 }).map((_, i) => {
      const a = (i * 30 * Math.PI) / 180
      return (
        <line
          key={i}
          x1={12 + 3.1 * Math.cos(a)}
          y1={12 + 3.1 * Math.sin(a)}
          x2={12 + 9.2 * Math.cos(a)}
          y2={12 + 9.2 * Math.sin(a)}
        />
      )
    })}
  </g>
)

const GLYPH: Record<ClientId, ReactNode> = {
  'claude-code': claudeBurst,
  'claude-desktop': claudeBurst,

  // Isometric cube.
  cursor: (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.6 L20 7.3 L20 16.7 L12 21.4 L4 16.7 L4 7.3 Z" />
      <path d="M12 2.6 L12 12 M12 12 L20 7.3 M12 12 L4 7.3" />
    </g>
  ),

  // Rocket — anti-gravity, pointing up.
  antigravity: (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 2.5 C15.3 5 16.4 9.2 16.4 13 L7.6 13 C7.6 9.2 8.7 5 12 2.5 Z" />
      <circle cx="12" cy="9" r="1.7" fill="currentColor" stroke="none" />
      <path d="M7.6 13 L5 16.2 L8 15.4 M16.4 13 L19 16.2 L16 15.4" />
      <path d="M10.3 16.6 L12 20.5 L13.7 16.6" />
    </g>
  ),

  // Code chevrons </>.
  vscode: (
    <g fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
      <path d="M8.5 7.5 L4 12 L8.5 16.5" />
      <path d="M15.5 7.5 L20 12 L15.5 16.5" />
      <path d="M13.2 5.5 L10.8 18.5" />
    </g>
  ),

  // Sail + mast + wave.
  windsurf: (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      <path d="M11 3 L11 16.5" />
      <path d="M11 3.6 C16.2 5.6 17.4 11 16.8 15 L11 15 Z" fill="currentColor" stroke="none" />
      <path d="M4 19 C7 17.4 9 20 12 18.4 C15 16.9 17 19.5 20 18" />
    </g>
  ),

  // Winged helmet — Hermes/Mercury messenger motif.
  hermes: (
    <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round">
      {/* helmet dome */}
      <path d="M7 13 C7 8.6 9.2 5.5 12 5.5 C14.8 5.5 17 8.6 17 13 L7 13 Z" />
      {/* helmet band */}
      <path d="M6.6 13 L17.4 13 L16.6 15 L7.4 15 Z" fill="currentColor" stroke="none" />
      {/* left wing */}
      <path d="M7 10.5 C4.5 10 3 11 2.5 12.4 C4 12.2 5.4 11.6 7 11.2" />
      {/* right wing */}
      <path d="M17 10.5 C19.5 10 21 11 21.5 12.4 C20 12.2 18.6 11.6 17 11.2" />
      {/* chin strap suggestion */}
      <path d="M9.5 15 L9.5 17.5 L14.5 17.5 L14.5 15" />
    </g>
  )
}

export function ClientIcon({ id, size = 40 }: { id: ClientId; size?: number }) {
  const { color } = CLIENT_BRAND[id]
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        color,
        background: `linear-gradient(150deg, ${color}30, ${color}08)`,
        border: `1px solid ${color}3a`
      }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" aria-hidden>
        {GLYPH[id]}
      </svg>
    </div>
  )
}
