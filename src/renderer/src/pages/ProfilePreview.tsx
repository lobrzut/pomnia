import clsx from 'clsx'
import { Copy, GripHorizontal, Save, User, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppLogo } from '../components/AppLogo'
import { ProgressBar } from '../components/ui'
import { api, type ProfilePreviewResult } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

type SaveFeedback = { kind: 'ok' | 'err'; text: string } | null
type ProgressPhase = 'user_md' | 'notes' | 'search' | 'summarize' | 'done'

export default function ProfilePreview() {
  const labels = uiLabels()
  const toast = useStore((s) => s.toast)
  const [loading, setLoading] = useState(true)
  const [pct, setPct] = useState(4)
  const [phase, setPhase] = useState<ProgressPhase>('user_md')
  const [result, setResult] = useState<ProfilePreviewResult | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<SaveFeedback>(null)

  function phaseLabel(p: ProgressPhase): string {
    switch (p) {
      case 'user_md':
        return labels.profilePreviewProgressVault
      case 'notes':
        return labels.profilePreviewProgressNotes
      case 'search':
        return labels.profilePreviewProgressSearch
      case 'summarize':
        return labels.profilePreviewProgressModel
      case 'done':
        return labels.profilePreviewProgressDone
      default:
        return labels.profilePreviewLoading
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPct(4)
    setPhase('user_md')
    setFeedback(null)

    const offProgress =
      typeof api.onProfilePreviewProgress === 'function'
        ? api.onProfilePreviewProgress((e) => {
            if (cancelled) return
            setPhase(e.phase)
            setPct(Math.max(4, Math.min(100, e.pct)))
          })
        : () => {}

    void api
      .profilePreviewLoad()
      .then((r) => {
        if (cancelled) return
        setPct(100)
        setPhase('done')
        setResult(r)
        setDraft(r.userMd ?? '')
      })
      .catch(() => {
        if (!cancelled) setResult({ status: 'no_knowledge' })
      })
      .finally(() => {
        if (!cancelled) {
          setPct(100)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      offProgress()
    }
  }, [])

  function emptyMessage(): string {
    switch (result?.status) {
      case 'vault_locked':
        return labels.profilePreviewEmptyVault
      case 'brain_down':
        return labels.profilePreviewEmptyBrain
      case 'no_knowledge':
      default:
        return labels.profilePreviewEmptyKnowledge
    }
  }

  const vaultLocked = result?.status === 'vault_locked'
  const canEdit = !loading && !vaultLocked && result != null
  // Determinate when we have real IPC pct; otherwise sweep while waiting on Ollama.
  const useIndeterminate = loading && phase === 'summarize' && pct < 90

  async function onSave(): Promise<void> {
    if (saving || !canEdit) return
    setSaving(true)
    setFeedback(null)
    try {
      const r = await api.profilePreviewSave(draft)
      if (r.ok) {
        setFeedback({ kind: 'ok', text: labels.profilePreviewSaved })
      } else if (r.error === 'too_long') {
        setFeedback({
          kind: 'err',
          text: labels.profilePreviewSaveTooLong(r.maxChars ?? 2200),
        })
      } else if (r.error === 'vault_locked') {
        setFeedback({ kind: 'err', text: labels.profilePreviewEmptyVault })
      } else {
        setFeedback({
          kind: 'err',
          text: r.detail ? `${labels.profilePreviewSaveFailed}: ${r.detail}` : labels.profilePreviewSaveFailed,
        })
      }
    } catch (e) {
      setFeedback({
        kind: 'err',
        text: `${labels.profilePreviewSaveFailed}: ${(e as Error).message}`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function copyText(text: string, okLabel: string): Promise<void> {
    const payload = text ?? ''
    if (!payload.trim()) return
    try {
      await navigator.clipboard.writeText(payload)
      setFeedback({ kind: 'ok', text: okLabel })
      toast({ kind: 'success', title: okLabel })
    } catch (e) {
      const detail = (e as Error).message
      setFeedback({
        kind: 'err',
        text: detail ? `${labels.profilePreviewCopyFailed}: ${detail}` : labels.profilePreviewCopyFailed,
      })
    }
  }

  return (
    <div
      className={clsx(
        'floating-pip-shell floating-pip-shell--solid flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl',
        'floating-pip-shell--idle',
      )}
    >
      <div className="drag flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3 w-3 shrink-0 text-ink-faint/60" aria-hidden />
          <AppLogo size="xs" className="!h-5 !w-5" />
          <span className="text-[10px] font-bold tracking-[0.12em] text-grad">
            {labels.profilePreviewTitle}
          </span>
          <span className="truncate text-[9px] text-ink-faint">{labels.profilePreviewSubtitle}</span>
        </div>
        <div className="no-drag flex shrink-0 items-center gap-0.5">
          {canEdit && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-ink-dim transition-colors hover:bg-white/10 hover:text-ink"
                disabled={!draft.trim()}
                onClick={() => void copyText(draft, labels.profilePreviewCopied)}
                title={labels.profilePreviewCopy}
              >
                <Copy className="h-3 w-3" aria-hidden />
                {labels.profilePreviewCopy}
              </button>
              <button
                type="button"
                className={clsx(
                  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-colors',
                  saving
                    ? 'cursor-wait text-ink-faint'
                    : 'bg-mint/20 text-mint hover:bg-mint/30',
                )}
                disabled={saving}
                onClick={() => void onSave()}
                title={labels.profilePreviewSave}
              >
                <Save className="h-3 w-3" aria-hidden />
                {saving ? labels.profilePreviewSaving : labels.profilePreviewSave}
              </button>
            </>
          )}
          <button
            type="button"
            className="rounded-md p-0.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
            onClick={() => void api.profilePreviewHide()}
            aria-label={labels.profilePreviewClose}
            title={labels.profilePreviewClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="no-drag flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 pb-2 pt-2">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-1 text-ink-faint">
            <User className="h-5 w-5 animate-pulse opacity-60" aria-hidden />
            <p className="text-[11px] font-medium text-ink-dim" role="status">
              {phaseLabel(phase)}
            </p>
            <div className="w-full max-w-[240px]">
              {useIndeterminate ? (
                <ProgressBar indeterminate />
              ) : (
                <ProgressBar value={pct} />
              )}
            </div>
            <p className="text-[9px] tracking-wide text-ink-faint/80">{labels.profilePreviewLoading}</p>
          </div>
        ) : vaultLocked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <User className="h-5 w-5 text-ink-faint/50" aria-hidden />
            <p className="text-[11px] leading-snug text-ink-faint">{emptyMessage()}</p>
          </div>
        ) : (
          <>
            {(result?.status === 'brain_down' || result?.status === 'no_knowledge') && (
              <p className="shrink-0 text-[10px] leading-snug text-ink-faint">{emptyMessage()}</p>
            )}
            <textarea
              id="profile-user-md"
              aria-label={labels.profilePreviewEditorHint}
              className={clsx(
                'min-h-0 flex-1 resize-none overflow-y-auto rounded-lg border border-white/10 bg-black/20 px-2 py-1.5',
                'font-mono text-[11px] leading-relaxed text-ink/95 outline-none',
                'placeholder:text-ink-faint/50 focus:border-mint/40',
              )}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                if (feedback) setFeedback(null)
              }}
              spellCheck={false}
              placeholder={labels.profilePreviewEditorHint}
            />
            {feedback && (
              <p
                className={clsx(
                  'shrink-0 text-center text-[10px] font-medium',
                  feedback.kind === 'ok' ? 'text-mint' : 'text-rose',
                )}
                role="status"
              >
                {feedback.text}
              </p>
            )}
          </>
        )}
        <p className="shrink-0 border-t border-white/10 pt-1.5 text-center text-[9px] tracking-wide text-ink-faint/80">
          {labels.profilePreviewFooter}
        </p>
      </div>
    </div>
  )
}
