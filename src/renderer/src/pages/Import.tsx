// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, FileText, FileUp, Import as ImportIcon, Trash2, Upload } from 'lucide-react'
import { Badge, Button, GlassCard, SourceTile, Spinner } from '../components/ui'
import { humanBytes, sourceMeta } from '../lib/format'
import { pathFromDroppedFile } from '../lib/dropFile'
import { uiLabels } from '../lib/labels'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type {
  DocImportProgressEvent,
  DocImportResult,
  DocOcrResult,
  ImportChatPreview,
  LibraryDocListItem,
} from '../lib/types'

const DOC_DROP_EXTENSIONS = new Set(['pdf', 'docx', 'md', 'txt', 'epub'])
const CHAT_DROP_EXTENSIONS = new Set(['zip', 'json', 'jsonl', 'md', 'txt'])

function fileExt(file: File): string {
  const name = file.name.toLowerCase()
  return name.includes('.') ? name.split('.').pop() ?? '' : ''
}

function isDocDropFile(file: File): boolean {
  return DOC_DROP_EXTENSIONS.has(fileExt(file))
}

function isChatDropFile(file: File): boolean {
  return CHAT_DROP_EXTENSIONS.has(fileExt(file))
}

type DocSortKey = 'date' | 'name' | 'size'

type ChatImportResult = {
  sealed: number
  added?: number
  updated?: number
  skipped?: number
  sources: { source: string; count: number }[]
}

export default function Import() {
  const { vault, refreshVault, toast, simpleMode, ollamaUrl } = useStore()
  const labels = uiLabels()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ChatImportResult | null>(null)
  const [chatDragOver, setChatDragOver] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [docDragOver, setDocDragOver] = useState(false)
  const [docProgress, setDocProgress] = useState<DocImportProgressEvent | null>(null)
  const [docResult, setDocResult] = useState<DocImportResult | DocOcrResult | null>(null)
  const [libraryDocs, setLibraryDocs] = useState<LibraryDocListItem[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [docFilter, setDocFilter] = useState('')
  const [docSort, setDocSort] = useState<DocSortKey>('date')
  const [chatPreview, setChatPreview] = useState<ImportChatPreview | null>(null)
  const [sealing, setSealing] = useState(false)

  const refreshLibraryDocs = useCallback(async () => {
    if (!vault.open) {
      setLibraryDocs([])
      return
    }
    try {
      setLibraryDocs(await api.docList())
    } catch {
      setLibraryDocs([])
    }
  }, [vault.open])

  useEffect(() => {
    const off = api.onDocImportProgress((e) => setDocProgress(e))
    return off
  }, [])

  useEffect(() => {
    void refreshLibraryDocs()
  }, [refreshLibraryDocs, vault.pendingLibraryIndex])

  const filteredLibraryDocs = useMemo(() => {
    const q = docFilter.trim().toLowerCase()
    let list = libraryDocs
    if (q) list = list.filter((d) => d.originalName.toLowerCase().includes(q))
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (docSort === 'name') return a.originalName.localeCompare(b.originalName, undefined, { sensitivity: 'base' })
      if (docSort === 'size') return (b.sourceBytes || 0) - (a.sourceBytes || 0)
      return (b.importedAt || '').localeCompare(a.importedAt || '')
    })
    return sorted
  }, [libraryDocs, docFilter, docSort])

  const libraryTotalBytes = useMemo(
    () => libraryDocs.reduce((n, d) => n + (d.sourceBytes || 0), 0),
    [libraryDocs],
  )

  function toastChatImport(r: ChatImportResult) {
    const added = r.added ?? 0
    const updated = r.updated ?? 0
    const skipped = r.skipped ?? 0
    const sealed = r.sealed ?? added + updated
    if (sealed > 0 || skipped > 0) {
      toast({
        kind: sealed > 0 ? 'success' : 'warn',
        title: labels.importChatSealedToast(added, updated, skipped),
        detail:
          r.sources.length > 0
            ? r.sources.map((s) => `${sourceMeta(s.source).label}: ${s.count}`).join(' · ')
            : sealed === 0 && skipped > 0
              ? labels.importChatAllDuplicatesDetail
              : undefined,
      })
      return
    }
    toast({ kind: 'warn', title: labels.importChatNothingRecognized })
  }

  async function importChatFile(filePath?: string) {
    if (!vault.open || busy || sealing || chatPreview) return
    setBusy(true)
    setResult(null)
    try {
      const file = filePath ?? (await api.pickFile())
      if (!file) return
      const preview = await api.importPreview(file)
      if (preview.conversationCount === 0) {
        toast({ kind: 'warn', title: labels.importChatNothingRecognized })
        return
      }
      setChatPreview(preview)
    } catch (e) {
      toast({ kind: 'error', title: labels.importChatFailedToast, detail: (e as Error).message })
    } finally {
      setBusy(false)
      setChatDragOver(false)
    }
  }

  async function confirmSealPreview() {
    if (!chatPreview || sealing) return
    setSealing(true)
    try {
      const r = await api.importToVault(chatPreview.path)
      setResult(r)
      setChatPreview(null)
      const sealed = r.sealed ?? (r.added ?? 0) + (r.updated ?? 0)
      if (sealed > 0) await refreshVault()
      toastChatImport(r)
    } catch (e) {
      toast({ kind: 'error', title: labels.importChatFailedToast, detail: (e as Error).message })
    } finally {
      setSealing(false)
    }
  }

  function cancelSealPreview() {
    if (sealing) return
    setChatPreview(null)
  }

  async function importDocFile(filePath?: string) {
    if (!vault.open || docBusy || ocrBusy) return
    setDocBusy(true)
    setDocResult(null)
    setDocProgress(null)
    try {
      const file = filePath ?? (await api.pickDocFile())
      if (!file) return
      const r = await api.docImport(file, ollamaUrl || undefined)
      if (!r) return
      setDocResult(r)
      if (r.skipped) {
        toast({ kind: 'warn', title: labels.importDocDuplicateToast })
        await refreshLibraryDocs()
        return
      }
      const detail = `${r.format.toUpperCase()} · ${labels.importDocPagesBadge(r.pages)} · ${r.extractionPath}${r.suggestOcr ? ' · OCR' : ''}`
      if (r.indexed) {
        toast({
          kind: 'success',
          title: labels.importDocIndexedToast(r.chunks),
          detail,
        })
      } else if (r.pendingIndex) {
        toast({
          kind: 'warn',
          title: labels.importDocQueuedToast,
          detail: r.indexError ? `${detail} · ${r.indexError}` : detail,
        })
      } else {
        toast({ kind: 'warn', title: labels.importDocQueuedToast, detail })
      }
      await refreshVault()
      await refreshLibraryDocs()
    } catch (e) {
      toast({ kind: 'error', title: labels.importDocFailedToast, detail: (e as Error).message })
    } finally {
      setDocBusy(false)
      setDocProgress(null)
      setDocDragOver(false)
    }
  }

  async function runOcrOnDoc() {
    if (!vault.open || !docResult?.suggestOcr || docBusy || ocrBusy) return
    setOcrBusy(true)
    setDocProgress(null)
    try {
      const r = await api.docOcr(docResult.docId, ollamaUrl || undefined)
      setDocResult(r)
      toast({
        kind: r.indexed ? 'success' : 'warn',
        title: labels.importDocOcrDoneToast(r.ocrPages),
        detail: `${r.extractionPath} · ${labels.importDocIndexedBadge(r.chunks)}`,
      })
      await refreshVault()
      await refreshLibraryDocs()
    } catch (e) {
      toast({ kind: 'error', title: labels.importDocOcrFailedToast, detail: (e as Error).message })
    } finally {
      setOcrBusy(false)
      setDocProgress(null)
    }
  }

  async function deleteLibraryDoc(doc: LibraryDocListItem) {
    if (!vault.open || deletingId) return
    if (!window.confirm(labels.importDocDeleteConfirm(doc.originalName))) return
    setDeletingId(doc.id)
    try {
      const r = await api.docRemove(doc.id)
      toast({
        kind: 'success',
        title: labels.importDocDeletedToast(r.originalName),
        detail:
          r.chunksRemoved > 0
            ? `${r.removedBlobs.length} blob(s) · ${r.chunksRemoved} chunk(s)`
            : `${r.removedBlobs.length} blob(s)`,
      })
      if (docResult?.docId === doc.id) setDocResult(null)
      await refreshVault()
      await refreshLibraryDocs()
    } catch (e) {
      toast({ kind: 'error', title: labels.importDocDeleteFailedToast, detail: (e as Error).message })
    } finally {
      setDeletingId(null)
    }
  }

  function handleChatDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (vault.open && !busy && !sealing && !chatPreview) setChatDragOver(true)
  }

  function handleChatDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setChatDragOver(false)
  }

  function handleChatDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setChatDragOver(false)
    if (!vault.open || busy || sealing || chatPreview) return
    const dropped = e.dataTransfer.files[0]
    if (!dropped) return
    if (!isChatDropFile(dropped)) {
      toast({ kind: 'warn', title: labels.importUnsupportedFormat, detail: labels.importFormats })
      return
    }
    const path = pathFromDroppedFile(dropped)
    if (!path) {
      toast({ kind: 'error', title: labels.importDropFailed, detail: labels.importDropNoPath })
      return
    }
    void importChatFile(path)
  }

  function handleDocDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    if (vault.open && !docBusy && !ocrBusy) setDocDragOver(true)
  }

  function handleDocDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDocDragOver(false)
  }

  function handleDocDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDocDragOver(false)
    if (!vault.open || docBusy) return

    const dropped = e.dataTransfer.files[0]
    if (!dropped) return
    if (!isDocDropFile(dropped)) {
      toast({ kind: 'warn', title: labels.importUnsupportedFormat, detail: labels.importDocFormats })
      return
    }
    const path = pathFromDroppedFile(dropped)
    if (!path) {
      toast({ kind: 'error', title: labels.importDropFailed, detail: labels.importDropNoPath })
      return
    }
    void importDocFile(path)
  }

  const providers: { id: string; how: string }[] = [
    { id: 'claude-ai', how: labels.importProviderClaude },
    { id: 'chatgpt', how: labels.importProviderChatgpt },
    { id: 'gemini', how: labels.importProviderGemini },
    { id: 'grok', how: labels.importProviderGrok },
  ]

  const addedCount = result?.added ?? 0
  const updatedCount = result?.updated ?? 0
  const skippedCount = result?.skipped ?? 0
  const sealedCount = result ? (result.sealed ?? addedCount + updatedCount) : 0

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl accent-grad ring-glow">
          <ImportIcon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grad">{labels.importTitle}</h1>
          <p className="text-sm text-ink-dim">{labels.importLead}</p>
        </div>
      </div>

      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">{labels.importChatSection}</div>

      <div
        role="button"
        tabIndex={vault.open && !busy && !sealing && !chatPreview ? 0 : -1}
        onClick={vault.open && !busy && !sealing && !chatPreview ? () => void importChatFile() : undefined}
        onKeyDown={(e) => {
          if (vault.open && !busy && !sealing && !chatPreview && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void importChatFile()
          }
        }}
        onDragEnter={handleChatDragOver}
        onDragOver={handleChatDragOver}
        onDragLeave={handleChatDragLeave}
        onDrop={handleChatDrop}
        className={`glass glass-hover mb-5 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-dashed p-10 text-center transition-colors ${
          chatDragOver ? 'border-iris bg-iris/10 ring-1 ring-iris/40' : 'border-white/10'
        } ${vault.open && !busy && !sealing && !chatPreview ? 'no-drag cursor-pointer' : ''}`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6">
          {busy ? <Spinner className="h-6 w-6 text-iris" /> : <FileUp className="h-6 w-6 text-iris" />}
        </div>
        <div className="text-sm font-semibold text-ink">
          {busy
            ? labels.importPickBusy
            : chatDragOver
              ? labels.importChatDrop
              : vault.open
                ? labels.importPick
                : labels.importVaultClosed}
        </div>
        <div className="text-xs text-ink-faint">{labels.importFormats}</div>
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Button
            onClick={() => void importChatFile()}
            disabled={busy || sealing || !!chatPreview || !vault.open}
            className="mt-1"
          >
            <Upload className="h-4 w-4" /> {labels.importSelect}
          </Button>
        </div>
      </div>

      {chatPreview && (
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }}>
          <GlassCard className="mb-5 flex flex-col gap-3 p-4">
            <div className="text-sm font-semibold text-ink">{labels.importChatConfirmTitle}</div>
            <div className="text-xs text-ink-dim">
              <div className="truncate font-medium text-ink">{chatPreview.fileName}</div>
              <div className="mt-1">
                {chatPreview.sources.length > 0
                  ? chatPreview.sources
                      .map((s) => labels.importChatConfirmSource(sourceMeta(s.source).label))
                      .join(' · ')
                  : labels.importChatConfirmSource('—')}
              </div>
              <div className="mt-0.5">
                {labels.importChatConfirmStats(chatPreview.conversationCount, chatPreview.messageCount)}
              </div>
              {(chatPreview.added > 0 || chatPreview.updated > 0 || chatPreview.skipped > 0) && (
                <div className="mt-0.5 text-ink-faint">
                  {labels.importChatConfirmDedup(chatPreview.added, chatPreview.updated, chatPreview.skipped)}
                </div>
              )}
            </div>
            {chatPreview.hasGeneric && (
              <p className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber-200">
                {labels.importChatConfirmGenericWarn}
              </p>
            )}
            {chatPreview.titles.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                  {labels.importChatConfirmTitles}
                </div>
                <ul className="list-inside list-disc text-xs text-ink-dim">
                  {chatPreview.titles.map((t) => (
                    <li key={t} className="truncate">
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void confirmSealPreview()} disabled={sealing}>
                {sealing ? <Spinner className="h-4 w-4" /> : null}
                {labels.importChatConfirmSeal}
              </Button>
              <Button variant="ghost" onClick={cancelSealPreview} disabled={sealing}>
                {labels.importChatConfirmCancel}
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {result && (sealedCount > 0 || skippedCount > 0) && (
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }}>
          <GlassCard className="mb-5 flex items-center gap-3 p-4">
            <CheckCircle2 className={`h-5 w-5 ${sealedCount > 0 ? 'text-mint' : 'text-amber-300'}`} />
            <div className="flex-1 text-sm text-ink">
              {labels.importChatSealedToast(addedCount, updatedCount, skippedCount)}
            </div>
            <div className="flex gap-1.5">
              {result.sources.map((s) => (
                <Badge key={s.source} color={sourceMeta(s.source).color}>
                  {sourceMeta(s.source).label} {s.count}
                </Badge>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      )}

      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">{labels.importDocSection}</div>

      <div
        role="button"
        tabIndex={vault.open && !docBusy ? 0 : -1}
        onClick={vault.open && !docBusy ? () => void importDocFile() : undefined}
        onKeyDown={(e) => {
          if (vault.open && !docBusy && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void importDocFile()
          }
        }}
        onDragEnter={handleDocDragOver}
        onDragOver={handleDocDragOver}
        onDragLeave={handleDocDragLeave}
        onDrop={handleDocDrop}
        className={`glass glass-hover mb-5 flex flex-col items-center gap-3 rounded-[var(--radius-xl)] border border-dashed p-8 text-center transition-colors ${
          docDragOver ? 'border-iris bg-iris/10 ring-1 ring-iris/40' : 'border-white/10'
        } ${vault.open && !docBusy ? 'no-drag cursor-pointer' : ''}`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6">
          {docBusy ? <Spinner className="h-6 w-6 text-iris" /> : <FileText className="h-6 w-6 text-iris" />}
        </div>
        <div className="text-sm font-semibold text-ink">
          {docBusy
            ? labels.importDocBusy
            : docDragOver
              ? labels.importDocDrop
              : vault.open
                ? labels.importDocPick
                : labels.importVaultClosed}
        </div>
        <div className="text-xs text-ink-faint">{labels.importDocFormats}</div>
        {docProgress && (docBusy || ocrBusy) && (
          <div className="text-xs text-ink-dim">
            {docProgress.label ??
              `${docProgress.phase === 'parse'
                ? labels.importDocProgressParse
                : docProgress.phase === 'ocr'
                  ? labels.importDocProgressOcr
                  : docProgress.phase === 'index'
                    ? labels.importDocProgressIndex
                    : docProgress.phase === 'brain-start'
                      ? labels.importDocProgressBrainStart
                      : docProgress.phase === 'encrypt'
                        ? labels.importDocProgressEncrypt
                        : docProgress.phase}…${docProgress.detail ? ` ${docProgress.detail}` : ''}`}
            {docProgress.total > 1 ? ` (${docProgress.done}/${docProgress.total})` : ''}
          </div>
        )}
        {(docBusy || ocrBusy) && !docProgress && ocrBusy && (
          <div className="text-xs text-ink-dim">{labels.importDocOcrBusy}</div>
        )}
        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <Button
            onClick={() => void importDocFile()}
            disabled={docBusy || ocrBusy || !vault.open}
            className="mt-1"
          >
            <Upload className="h-4 w-4" /> {labels.importDocSelect}
          </Button>
        </div>
      </div>

      {docResult && !docResult.skipped && (
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }}>
          <GlassCard className="mb-5 flex flex-col gap-2 p-4 text-sm text-ink">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-mint" />
              <span className="font-semibold">{labels.importDocDone}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge color="iris">{docResult.format.toUpperCase()}</Badge>
              <Badge color="mint">{labels.importDocPagesBadge(docResult.pages)}</Badge>
              <Badge color="amber">{docResult.extractionPath}</Badge>
              {docResult.encrypted && <Badge color="mint">{labels.importDocEncryptedBadge}</Badge>}
              {docResult.indexed ? (
                <Badge color="mint">{labels.importDocIndexedBadge(docResult.chunks)}</Badge>
              ) : (
                <Badge color="rose">{labels.importDocNotIndexedBadge}</Badge>
              )}
            </div>
            {docResult.suggestOcr && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-amber-200/90">{labels.importDocOcrHint}</p>
                <Button
                  onClick={() => void runOcrOnDoc()}
                  disabled={ocrBusy || docBusy || !vault.open}
                  className="self-start"
                >
                  {ocrBusy ? (
                    <>
                      <Spinner className="h-4 w-4" /> {labels.importDocOcrBusy}
                    </>
                  ) : (
                    labels.importDocOcrRun
                  )}
                </Button>
              </div>
            )}
            {docResult.pendingIndex && (
              <p className="text-xs text-ink-dim">
                {docResult.indexError ?? labels.importDocQueuedHint}
              </p>
            )}
            {!docResult.brainRunning && !docResult.pendingIndex && (
              <p className="text-xs text-ink-dim">{labels.importDocBrainOff}</p>
            )}
          </GlassCard>
        </motion.div>
      )}

      {vault.open && (
        <div className="mb-5">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wider text-ink-faint">
                {labels.importDocLibraryTitle}
              </div>
              {libraryDocs.length > 0 && (
                <div className="mt-0.5 text-xs text-ink-dim">
                  {labels.importDocLibraryStats(libraryDocs.length, humanBytes(libraryTotalBytes))}
                </div>
              )}
            </div>
          </div>
          {libraryDocs.length === 0 ? (
            <p className="text-xs text-ink-faint">{labels.importDocLibraryEmpty}</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2">
                <input
                  type="search"
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  placeholder={labels.importDocLibraryFilter}
                  className="min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-iris/50"
                />
                <select
                  value={docSort}
                  onChange={(e) => setDocSort(e.target.value as DocSortKey)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-ink outline-none focus:border-iris/50"
                  aria-label={labels.importDocLibrarySort}
                >
                  <option value="date">{labels.importDocLibrarySortDate}</option>
                  <option value="name">{labels.importDocLibrarySortName}</option>
                  <option value="size">{labels.importDocLibrarySortSize}</option>
                </select>
              </div>
              {filteredLibraryDocs.length === 0 ? (
                <p className="text-xs text-ink-faint">{labels.importDocLibraryFilterEmpty}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {filteredLibraryDocs.map((doc) => {
                    const indexPlain = doc.indexedAt
                      ? labels.importDocLibraryIndexed
                      : labels.importDocNotIndexedBadge
                    const metaLine = [
                      doc.format.toUpperCase(),
                      labels.importDocPagesBadge(doc.pages),
                      humanBytes(doc.sourceBytes || 0),
                      ...(doc.pendingIndex ? [] : [indexPlain]),
                    ].join(' · ')
                    return (
                      <GlassCard
                        key={doc.id}
                        className="group flex items-center gap-3 px-3 py-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-iris" />
                        <div className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {doc.originalName}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-ink-dim">
                          <span className="max-w-[14rem] truncate text-right sm:max-w-none">{metaLine}</span>
                          {doc.pendingIndex && (
                            <Badge color="rose">{labels.importDocLibraryPending}</Badge>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteLibraryDoc(doc)}
                          disabled={!!deletingId || docBusy || ocrBusy}
                          aria-label={labels.importDocDeleteAria(doc.originalName)}
                          className="no-drag shrink-0 rounded-lg p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-white/6 hover:text-ink focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-30"
                        >
                          {deletingId === doc.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </GlassCard>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">{labels.importProviders}</div>
      <div className="grid grid-cols-2 gap-3">
        {providers.map((p) => {
          const m = sourceMeta(p.id)
          return (
            <GlassCard key={p.id} className="flex items-start gap-3 p-4">
              <SourceTile glyph={m.glyph} color={m.color} size={38} />
              <div className="min-w-0">
                <div className="font-semibold text-ink">{m.label}</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{p.how}</div>
              </div>
            </GlassCard>
          )
        })}
      </div>

      {!simpleMode && (
        <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">{labels.importLegalNote}</p>
      )}
    </div>
  )
}
