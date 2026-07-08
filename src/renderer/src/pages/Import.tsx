import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, FileText, FileUp, Import as ImportIcon, Upload } from 'lucide-react'
import { Badge, Button, GlassCard, SourceTile, Spinner } from '../components/ui'
import { sourceMeta } from '../lib/format'
import { pathFromDroppedFile } from '../lib/dropFile'
import { uiLabels } from '../lib/labels'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'
import type { DocImportProgressEvent, DocImportResult } from '../lib/types'

const DOC_DROP_EXTENSIONS = new Set(['pdf', 'docx', 'md', 'txt', 'epub'])

function isDocDropFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const ext = name.includes('.') ? name.split('.').pop() ?? '' : ''
  return DOC_DROP_EXTENSIONS.has(ext)
}

const PROVIDERS: { id: string; how: string }[] = [
  { id: 'claude-ai', how: 'Settings → Privacy → Export data → conversations.json (ZIP)' },
  { id: 'chatgpt', how: 'Settings → Data controls → Export data → conversations.json (ZIP)' },
  { id: 'gemini', how: 'Google Takeout → Gemini Apps activity → JSON' },
  { id: 'grok', how: 'Account → export conversations → ZIP/JSON' }
]

export default function Import() {
  const { vault, refreshVault, toast, simpleMode, ollamaUrl } = useStore()
  const labels = uiLabels()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ sealed: number; sources: { source: string; count: number }[] } | null>(null)
  const [docBusy, setDocBusy] = useState(false)
  const [docDragOver, setDocDragOver] = useState(false)
  const [docProgress, setDocProgress] = useState<DocImportProgressEvent | null>(null)
  const [docResult, setDocResult] = useState<DocImportResult | null>(null)

  useEffect(() => {
    const off = api.onDocImportProgress((e) => setDocProgress(e))
    return off
  }, [])

  async function pickAndImport() {
    if (!vault.open || busy) return
    setBusy(true)
    setResult(null)
    try {
      const file = await api.pickFile()
      if (!file) return
      const r = await api.importToVault(file)
      setResult(r)
      if (r.sealed > 0) {
        await refreshVault()
        toast({
          kind: 'success',
          title: `Imported ${r.sealed} conversations`,
          detail: r.sources.map((s) => `${sourceMeta(s.source).label}: ${s.count}`).join(' · ')
        })
      } else {
        toast({ kind: 'warn', title: 'Nothing recognized in that file' })
      }
    } catch (e) {
      toast({ kind: 'error', title: 'Import failed', detail: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  async function importDocFile(filePath?: string) {
    if (!vault.open || docBusy) return
    setDocBusy(true)
    setDocResult(null)
    setDocProgress(null)
    try {
      const file = filePath ?? (await api.pickDocFile())
      if (!file) return
      const r = await api.docImport(file, ollamaUrl || undefined)
      if (!r) return
      setDocResult(r)
      const detail = `${r.format.toUpperCase()} · ${labels.importDocPagesBadge(r.pages)} · ${r.extractionPath}${r.suggestOcr ? ' · OCR zalecane' : ''}`
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
    } catch (e) {
      toast({ kind: 'error', title: labels.importDocFailedToast, detail: (e as Error).message })
    } finally {
      setDocBusy(false)
      setDocProgress(null)
      setDocDragOver(false)
    }
  }

  function handleDocDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (vault.open && !docBusy) setDocDragOver(true)
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

      {/* Drop / pick zone — plain glass panel (not motion-animated) so it stays visible under route transitions */}
      <div
        role="button"
        tabIndex={vault.open && !busy ? 0 : -1}
        onClick={vault.open && !busy ? pickAndImport : undefined}
        onKeyDown={(e) => {
          if (vault.open && !busy && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            void pickAndImport()
          }
        }}
        className={`glass glass-hover mb-5 flex flex-col items-center justify-center gap-3 rounded-[var(--radius-xl)] border border-dashed p-10 text-center ${
          vault.open && !busy ? 'no-drag cursor-pointer' : ''
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6">
          {busy ? <Spinner className="h-6 w-6 text-iris" /> : <FileUp className="h-6 w-6 text-iris" />}
        </div>
        <div className="text-sm font-semibold text-ink">
          {busy ? labels.importPickBusy : vault.open ? labels.importPick : labels.importVaultClosed}
        </div>
        <div className="text-xs text-ink-faint">{labels.importFormats}</div>
        <Button onClick={pickAndImport} disabled={busy || !vault.open} className="mt-1">
          <Upload className="h-4 w-4" /> {labels.importSelect}
        </Button>
      </div>

      {result && result.sealed > 0 && (
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }}>
          <GlassCard className="mb-5 flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-mint" />
            <div className="flex-1 text-sm text-ink">
              Sealed <span className="font-semibold">{result.sealed}</span> conversations into the vault — browse and
              search them in <span className="text-iris">Chats</span>.
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
        {docProgress && docBusy && (
          <div className="text-xs text-ink-dim">
            {docProgress.label ??
              `${docProgress.phase === 'parse'
                ? labels.importDocProgressParse
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
        <Button onClick={() => void importDocFile()} disabled={docBusy || !vault.open} className="mt-1">
          <Upload className="h-4 w-4" /> {labels.importDocSelect}
        </Button>
      </div>

      {docResult && (
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
              <p className="text-xs text-amber-200/90">{labels.importDocOcrHint}</p>
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

      <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-faint">{labels.importProviders}</div>
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => {
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
