// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download } from 'lucide-react'
import {
  assessDistillPreflight,
  OLLAMA_DOWNLOAD_URL,
  type DistillPreflightItem,
  type DistillPreflightReport,
} from '@core/brain/distillPreflight'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import type { BrainStatus, OllamaPullEvent } from '../lib/types'
import { Button, ProgressBar, Spinner } from './ui'

/**
 * Blocking checklist for a distill attempt. Pull buttons use the same IPC as
 * the Brain profiles card. A LAN Ollama URL gets a "start that daemon" line,
 * not a link to install Ollama on this PC.
 */
export function DistillPreflightPanel({
  ollamaUrl,
  distillModel,
  requireEmbed,
  onReadyChange,
  onContinue,
  continueLabel,
}: {
  ollamaUrl: string
  distillModel: string
  requireEmbed: boolean
  onReadyChange?: (ok: boolean) => void
  /** Shown only once every row is green. */
  onContinue?: () => void
  continueLabel?: string
}) {
  const labels = uiLabels()
  const [checking, setChecking] = useState(true)
  const [status, setStatus] = useState<BrainStatus | null>(null)
  const [pull, setPull] = useState<OllamaPullEvent | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      setStatus(await api.brainStatus(ollamaUrl.trim() || undefined))
    } catch {
      setStatus({
        reachable: false,
        baseUrl: ollamaUrl.trim() || 'http://127.0.0.1:11434',
        chatModel: distillModel,
        embedModel: 'nomic-embed-text',
        models: [],
      })
    } finally {
      setChecking(false)
    }
  }, [distillModel, ollamaUrl])

  useEffect(() => {
    void check()
  }, [check])

  useEffect(() => api.onOllamaPullProgress(setPull), [])

  const report: DistillPreflightReport | null = status
    ? assessDistillPreflight({
        reachable: status.reachable,
        models: status.models,
        distillModel,
        embedModel: status.embedModel || 'nomic-embed-text',
        requireEmbed,
        ollamaUrl: status.baseUrl || ollamaUrl,
      })
    : null

  const onReadyChangeRef = useRef(onReadyChange)
  onReadyChangeRef.current = onReadyChange
  useEffect(() => {
    onReadyChangeRef.current?.(report?.ok === true)
  }, [report?.ok])

  async function pullModel(model: string) {
    if (pull || !status?.reachable) return
    setPullError(null)
    setPull({ model, status: 'starting' })
    const url = (status.baseUrl || ollamaUrl).trim() || undefined
    try {
      await api.ollamaPull(model, url)
      await check()
    } catch (e) {
      setPullError((e as Error).message || labels.toastPullFailed)
    } finally {
      setPull(null)
    }
  }

  function row(item: DistillPreflightItem) {
    const model = item.id === 'ollama' ? null : item.model
    const active = model !== null && pull?.model === model
    const pct = active && pull?.total ? Math.round(((pull.completed ?? 0) / pull.total) * 100) : null
    return (
      <li key={item.id} className="rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
        <div className="flex flex-wrap items-start gap-2">
          {item.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-mint" />
          ) : (
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-amber/60 bg-amber/20" />
          )}
          <div className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink">
            {item.id === 'ollama' &&
              (item.ok
                ? labels.distillPreflightOllamaOk(item.url)
                : item.local
                  ? labels.distillPreflightOllamaDownLocal
                  : labels.distillPreflightOllamaDownRemote(item.url))}
            {item.id === 'embed' &&
              (item.ok
                ? labels.distillPreflightEmbedOk(item.model)
                : labels.distillPreflightEmbedMissing(item.pull))}
            {item.id === 'distill' &&
              (item.ok
                ? labels.distillPreflightDistillOk(item.model)
                : labels.distillPreflightDistillMissing(item.pull, item.size))}
          </div>
          {!item.ok && item.id === 'ollama' && item.local && (
            <button
              type="button"
              className="no-drag shrink-0 text-[11px] font-semibold text-iris hover:underline"
              onClick={() => window.open(OLLAMA_DOWNLOAD_URL, '_blank', 'noopener,noreferrer')}
            >
              {labels.distillPreflightInstallLink}
            </button>
          )}
          {!item.ok && item.id !== 'ollama' && (
            active ? (
              <button
                type="button"
                className="no-drag shrink-0 text-[11px] font-semibold text-rose hover:underline"
                onClick={() => void api.ollamaPullCancel()}
              >
                {labels.onboardingEngineCancelPull}
              </button>
            ) : (
              <Button
                variant="soft"
                className="!px-2.5 !py-1 !text-[11px]"
                disabled={pull !== null || !status?.reachable}
                onClick={() => void pullModel(item.model)}
              >
                <Download className="h-3 w-3" /> {labels.onboardingEnginePullBtn}
              </Button>
            )
          )}
        </div>
        {active && (
          <div className="mt-2 space-y-1 pl-6">
            <ProgressBar value={pct ?? 8} />
            <span className="text-[10px] text-ink-faint">
              {pct !== null && pull?.total
                ? `${pct}% · ${((pull.completed ?? 0) / 1e9).toFixed(2)} / ${(pull.total / 1e9).toFixed(2)} GB`
                : pull?.status}
            </span>
          </div>
        )}
      </li>
    )
  }

  if (checking && !report) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-ink-dim">
        <Spinner className="h-4 w-4" /> {labels.distillPreflightChecking}
      </div>
    )
  }

  return (
    <div className="space-y-3 text-left">
      <ul className="space-y-2">{report?.items.map(row)}</ul>
      {pullError && <p className="text-[12px] text-rose">{pullError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="soft" onClick={() => void check()} disabled={checking} className="!px-3 !py-1.5 !text-[12px]">
          {checking ? <Spinner className="h-3.5 w-3.5" /> : null}
          {labels.distillPreflightRecheck}
        </Button>
        {onContinue && (
          <Button onClick={onContinue} disabled={!report?.ok} className="!px-3 !py-1.5 !text-[12px]">
            {continueLabel ?? labels.distillPreflightContinue}
          </Button>
        )}
      </div>
    </div>
  )
}
