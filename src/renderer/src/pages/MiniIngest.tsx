// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * "Do Pomnia" — put material into the memory from the Pomnia that has none.
 *
 * A separate page from the full app's Import, and not a trimmed copy of it.
 * That one talks about a vault, a local index and a distiller running here;
 * every one of those sentences is false in Mini, and a page that has to be read
 * past to be used is worse than a page that says less.
 *
 * Two steps, in the order they happen: parse here, then send. They are separate
 * on screen because they fail for different reasons and at different times —
 * a PDF with no text layer is not a network problem, and a rejected token is
 * not a parsing one.
 */

import { useCallback, useEffect, useState } from 'react'
import { FileUp, Send, Trash2, UploadCloud } from 'lucide-react'

import { Button, GlassCard, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

type Parsed = Awaited<ReturnType<typeof api.miniIngestFiles>>['files']

export default function MiniIngest() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [staged, setStaged] = useState(0)
  const [files, setFiles] = useState<Parsed>([])
  const [parsing, setParsing] = useState(false)
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    setStaged((await api.miniIngestState()).staged)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function pick() {
    const paths = await api.miniIngestPick()
    if (paths.length === 0) return
    setParsing(true)
    try {
      const r = await api.miniIngestFiles(paths)
      // Append rather than replace: picking a second batch is adding to what is
      // staged, and wiping the first list would hide what is about to be sent.
      setFiles((prev) => [...prev, ...r.files])
      setStaged(r.staged)
      const bad = r.files.filter((f) => f.error)
      if (bad.length) {
        toast({
          kind: 'warn',
          title: labels.ingestParsedWithErrors(r.files.length - bad.length, bad.length),
          detail: bad.map((f) => `${f.file}: ${f.error}`).join(' · '),
        })
      }
    } catch (e) {
      toast({ kind: 'error', title: labels.ingestParseFailed, detail: (e as Error).message })
    } finally {
      setParsing(false)
    }
  }

  async function send() {
    setSending(true)
    try {
      const r = await api.miniIngestPush()
      if (r.ok) {
        toast({
          kind: 'success',
          title: labels.ingestSentTitle(r.result.uploaded),
          detail: labels.ingestSentDetail,
        })
        setFiles([])
      } else {
        // Each refusal is a different thing to do next, so each says which.
        toast({ kind: 'error', title: labels.ingestPushReason(r.reason), detail: r.detail })
      }
      await refresh()
    } finally {
      setSending(false)
    }
  }

  async function clear() {
    await api.miniIngestClear()
    setFiles([])
    await refresh()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <UploadCloud className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.ingestTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.ingestLead}</p>
        </div>
      </div>

      <GlassCard className="mb-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void pick()} disabled={parsing || sending}>
            {parsing ? <Spinner className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
            {labels.ingestPick}
          </Button>
          <span className="text-[11px] text-ink-faint">{labels.ingestFormats}</span>
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f, i) => (
              <div
                key={`${f.file}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-ink">{f.file}</div>
                  <div className={`text-[11px] ${f.error ? 'text-amber' : 'text-ink-faint'}`}>
                    {f.error ?? f.detail}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {labels.ingestNoteCount(f.notes)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <p className="mb-3 text-xs text-ink-dim">
          {staged > 0 ? labels.ingestStaged(staged) : labels.ingestNothingStaged}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void send()} disabled={sending || parsing || staged === 0}>
            {sending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {labels.ingestSend}
          </Button>
          {staged > 0 && (
            <Button variant="soft" onClick={() => void clear()} disabled={sending || parsing}>
              <Trash2 className="h-3.5 w-3.5" /> {labels.ingestClear}
            </Button>
          )}
        </div>
        {/* Staging survives a failed send on purpose: retrying should not mean
            parsing a 400-page PDF a second time. */}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{labels.ingestSendHint}</p>
      </GlassCard>
    </div>
  )
}
