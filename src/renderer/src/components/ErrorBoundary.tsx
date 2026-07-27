// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * Catches render errors in a page so one broken view shows a recover card instead
 * of blanking the whole window. The sidebar lives outside this boundary, so the
 * user can always navigate away; switching route remounts and clears the error.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown): void {
    // Surfaced for diagnosis; also visible in the fallback below.
    console.error('[pomnia] page render error:', error, info)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto mt-24 max-w-md text-center">
        <div className="glass rounded-[var(--radius-xl)] p-7">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose/15">
            <AlertTriangle className="h-7 w-7 text-rose" />
          </div>
          <h2 className="text-lg font-semibold text-ink">Ta strona się wysypała</h2>
          <p className="mt-2 break-words rounded-lg bg-black/30 p-3 text-left font-mono text-[11px] text-rose">
            {error.message || String(error)}
          </p>
          <p className="mt-3 text-sm text-ink-dim">
            Kliknij inną zakładkę w menu, albo przeładuj aplikację.
          </p>
          <button
            onClick={() => location.reload()}
            className="no-drag mt-4 inline-flex items-center gap-2 rounded-xl accent-grad px-4 py-2.5 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" />
            Przeładuj
          </button>
        </div>
      </div>
    )
  }
}
