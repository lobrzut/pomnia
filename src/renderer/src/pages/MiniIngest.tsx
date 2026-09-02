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
import { ChevronDown, ChevronRight, Cpu, Download, FileUp, Send, Trash2, UploadCloud } from 'lucide-react'

import { Button, GlassCard, Input, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'
import { defaultChatModel, VRAM_PROFILES } from '@core/brain/profiles'
import { hasOllamaModel } from '@core/brain/modelMatch'

type Parsed = Awaited<ReturnType<typeof api.miniIngestFiles>>['files']

export default function MiniIngest() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const ollamaUrl = useStore((s) => s.ollamaUrl)
  const setOllamaUrl = useStore((s) => s.setOllamaUrl)
  const [staged, setStaged] = useState(0)
  const [bytes, setBytes] = useState(0)
  const [eta, setEta] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [ollama, setOllama] = useState<{ reachable: boolean; models: string[]; chatModel: string } | null>(null)
  const [model, setModel] = useState('')
  const [pulling, setPulling] = useState(false)
  const [showOllama, setShowOllama] = useState(false)
  const [files, setFiles] = useState<Parsed>([])
  const [parsing, setParsing] = useState(false)
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    const st = await api.miniIngestState()
    setStaged(st.staged)
    setBytes(st.bytes)
    setEta(st.etaSeconds)
  }, [])

  const checkOllama = useCallback(async () => {
    const st = await api.brainStatus(ollamaUrl || undefined)
    setOllama({ reachable: st.reachable, models: st.models, chatModel: st.chatModel })
    setModel((m) => m || st.chatModel || defaultChatModel())
  }, [ollamaUrl])

  useEffect(() => {
    void refresh()
    void checkOllama().catch(() => setOllama({ reachable: false, models: [], chatModel: '' }))
  }, [refresh, checkOllama])

  async function pick() {
    const paths = await api.miniIngestPick()
    await ingest(paths)
  }

  /**
   * Dropped files reach us as File objects, and only the preload can turn
   * one into a path — the renderer is not allowed to know where a file is.
   */
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.getPathForFile(f))
      .filter(Boolean)
    void ingest(paths)
  }

  async function ingest(paths: string[]) {
    if (paths.length === 0) return
    setParsing(true)
    try {
      const r = await api.miniIngestFiles(paths, { ollamaUrl: ollamaUrl || undefined, model })
      // Append rather than replace: picking a second batch is adding to what is
      // staged, and wiping the first list would hide what is about to be sent.
      setFiles((prev) => [...prev, ...r.files])
      setStaged(r.staged)
      // The size and the estimate change with what was just parsed.
      void refresh()
      if (r.rawTranscripts) {
        // Not an error, and not a success either: the material went in, but
        // as raw conversation rather than as knowledge. Saying so is the
        // difference between a memory and a pile of logs.
        toast({ kind: 'warn', title: labels.ingestRawTitle, detail: labels.ingestRawDetail })
      }
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

      {/*
        The distiller, and where it lives. Nothing here assumes localhost:
        the reason to run Mini is usually that the heavy parts are on another
        machine, and a 9 GB model is the heaviest part there is.
      */}
      <GlassCard className="mb-5 p-5">
        {/*
          Collapsed by default: the address and the model are set once and
          then never touched, while the status line above them is the part
          worth seeing on every visit. Folded away, it still answers the only
          question this card exists for — will the next import be distilled.
        */}
        <button
          onClick={() => setShowOllama((v) => !v)}
          className="no-drag flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Cpu className="h-4 w-4 text-iris" /> {labels.ingestOllamaTitle}
          </span>
          <span className="flex items-center gap-2">
            <span className={`text-[11px] ${ollama?.reachable ? 'text-ink-faint' : 'text-amber'}`}>
              {ollama === null
                ? labels.ingestOllamaChecking
                : !ollama.reachable
                  ? labels.ingestOllamaUnreachable
                  : hasOllamaModel(ollama.models, model)
                    ? labels.ingestOllamaReady(model)
                    : labels.ingestOllamaModelMissing(model)}
            </span>
            {showOllama ? (
              <ChevronDown className="h-4 w-4 text-ink-faint" />
            ) : (
              <ChevronRight className="h-4 w-4 text-ink-faint" />
            )}
          </span>
        </button>
        {showOllama && (
        <>
        <p className="mb-3 mt-3 text-xs text-ink-dim">{labels.ingestOllamaLead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={ollamaUrl}
            onChange={(e) => setOllamaUrl(e.target.value)}
            onBlur={() => void checkOllama().catch(() => setOllama({ reachable: false, models: [], chatModel: '' }))}
            placeholder="http://127.0.0.1:11434"
            className="w-64"
          />
          {/*
            The two tiers, not a free-text box. Standard is llama3.1:8b
            because it was measured against the gate that decides whether a
            note reaches retrieval at all: 6.853 to the 14B's 5.838, through
            the gate 87% against 73%, and about twice as fast. Lite is not
            the bottom of a quality ladder — it is what runs on a 4-6 GB card,
            and it says so rather than implying it was measured too.
          */}
          <select
            value={VRAM_PROFILES.some((p) => p.chatModel === model) ? model : 'custom'}
            onChange={(e) => e.target.value !== 'custom' && setModel(e.target.value)}
            className="no-drag rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink"
          >
            {VRAM_PROFILES.map((p) => (
              <option key={p.id} value={p.chatModel}>
                {p.label} — {p.chatModel} ({p.chatSize}, {p.vram})
              </option>
            ))}
            {!VRAM_PROFILES.some((p) => p.chatModel === model) && (
              <option value="custom">{model || labels.ingestModelCustom}</option>
            )}
          </select>
          {ollama?.reachable && model && !hasOllamaModel(ollama.models, model) && (
            <Button
              variant="soft"
              disabled={pulling}
              onClick={() => {
                setPulling(true)
                void api
                  .ollamaPull(model, ollamaUrl || undefined)
                  .then(() => checkOllama())
                  .then(() => toast({ kind: 'success', title: labels.ingestModelPulled(model), detail: '' }))
                  .catch((e: Error) => toast({ kind: 'error', title: labels.ingestModelPullFailed, detail: e.message }))
                  .finally(() => setPulling(false))
              }}
            >
              {pulling ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {labels.ingestModelPull}
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{labels.ingestOllamaHint}</p>
        </>
        )}
      </GlassCard>

      {/* The handlers live on a wrapper: GlassCard takes no DOM props, and
          giving it a pass-through just for this would widen its surface for
          one caller. */}
      <div
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`mb-5 rounded-2xl transition-shadow ${dragging ? 'ring-2 ring-iris/60' : ''}`}
      >
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void pick()} disabled={parsing || sending}>
            {parsing ? <Spinner className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
            {labels.ingestPick}
          </Button>
          <span className="text-[11px] text-ink-faint">
            {dragging ? labels.ingestDropNow : labels.ingestFormats}
          </span>
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
      </div>

      <GlassCard className="p-5">
        <p className="mb-3 text-xs text-ink-dim">
          {staged > 0 ? labels.ingestStaged(staged) : labels.ingestNothingStaged}
          {staged > 0 && ` · ${labels.ingestBytes(bytes)}`}
          {/* Only after a real upload has been timed. Before that, saying
              nothing is the honest answer. */}
          {staged > 0 && (eta === null ? ` · ${labels.ingestEtaUnknown}` : ` · ${labels.ingestEta(eta)}`)}
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
