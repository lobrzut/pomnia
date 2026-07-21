import clsx from 'clsx'
import { GripHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isHandshakePhrase } from '@core/handshakePhrase'
import { AppLogo } from '../components/AppLogo'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'

export default function Handshake() {
  const labels = uiLabels()
  const [value, setValue] = useState('')
  const [flash, setFlash] = useState(false)
  const [armed, setArmed] = useState(false)
  const [hint, setHint] = useState<'idle' | 'bad' | 'ok'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void api.handshakeGetArmed().then((r) => setArmed(r.armed))
    const off = api.onHandshakeArmed((e) => setArmed(e.armed))
    const t = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => {
      off()
      window.clearTimeout(t)
    }
  }, [])

  async function submit() {
    if (!value.trim()) return
    if (!isHandshakePhrase(value)) {
      setHint('bad')
      return
    }
    const r = await api.handshakeTry(value)
    if (!r.ok) {
      setHint('bad')
      return
    }
    setArmed(true)
    setHint('ok')
    setFlash(true)
    window.setTimeout(() => setFlash(false), 900)
    window.setTimeout(() => void api.handshakeHide(), 1100)
  }

  return (
    <div
      className={clsx(
        'floating-pip-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl',
        flash && 'handshake-flash',
        armed && 'floating-pip-shell--live',
        !armed && 'floating-pip-shell--idle',
      )}
    >
      <div className="drag flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3 w-3 shrink-0 text-ink-faint/60" aria-hidden />
          <AppLogo size="xs" className="!h-5 !w-5" />
          <span className="text-[10px] font-bold tracking-[0.12em] text-grad">HANDSHAKE</span>
          {armed ? (
            <span className="rounded bg-mint/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-mint">
              {labels.handshakeArmedBadge}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="no-drag rounded-md p-0.5 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
          onClick={() => void api.handshakeHide()}
          aria-label={labels.handshakeClose}
          title={labels.handshakeClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="no-drag flex flex-1 flex-col justify-center gap-2 px-3 pb-3 pt-2">
        <p className="text-[10px] leading-snug text-ink-faint">{labels.handshakeHint}</p>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (hint !== 'idle') setHint('idle')
            }}
            placeholder={labels.handshakePlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12px] text-ink outline-none placeholder:text-ink-faint/50 focus:border-mint/40"
            aria-label={labels.handshakePlaceholder}
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-mint/90 px-2.5 py-1.5 text-[11px] font-semibold text-[#060a08] transition-opacity hover:opacity-90"
          >
            {labels.handshakeSubmit}
          </button>
        </form>
        {hint === 'bad' ? (
          <p className="text-[10px] text-rose-300/90">{labels.handshakeWrong}</p>
        ) : null}
        {hint === 'ok' ? (
          <p className="text-[11px] font-medium text-mint">{labels.handshakeReady}</p>
        ) : null}
      </div>
    </div>
  )
}
