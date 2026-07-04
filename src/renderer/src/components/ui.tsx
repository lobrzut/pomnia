import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { useStore } from '../store/useStore'

export function GlassCard({
  children,
  className,
  hover,
  delay = 0,
  onClick
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  delay?: number
  onClick?: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={hover ? { y: -4 } : undefined}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      onClick={onClick}
      className={clsx(
        'glass rounded-[var(--radius-xl)]',
        hover && 'glass-hover cursor-pointer',
        onClick && 'no-drag cursor-pointer',
        className
      )}
    >
      {children}
    </motion.div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.97 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'no-drag relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        variant === 'primary' && 'accent-grad text-white shadow-[0_10px_30px_-10px_#6366f1cc]',
        variant === 'soft' && 'bg-white/8 text-ink hover:bg-white/14 border border-white/10',
        variant === 'ghost' && 'text-ink-dim hover:text-ink hover:bg-white/6',
        variant === 'danger' && 'bg-rose/15 text-rose border border-rose/30 hover:bg-rose/25',
        className
      )}
    >
      {children}
    </motion.button>
  )
}

export function Badge({ children, color = '#9aa3bd' }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}33` }}
    >
      {children}
    </span>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className)} />
}

export function Toggle({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'no-drag relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        checked
          ? 'bg-iris shadow-[inset_0_1px_2px_#0003,0_0_14px_-3px_#6366f1b3]'
          : 'bg-white/10 shadow-[inset_0_1px_3px_#0006] ring-1 ring-inset ring-white/10'
      )}
    >
      <motion.span
        aria-hidden
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 550, damping: 32 }}
        className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_#0006]"
      />
    </button>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <motion.div
        className="h-full accent-grad"
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ ease: 'easeOut', duration: 0.3 }}
      />
    </div>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-faint">{label}</span>
      {children}
    </label>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'no-drag w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-iris/60 focus:ring-2 focus:ring-iris/20',
        props.className
      )}
    />
  )
}

const TOAST_ICON = {
  info: <Info className="h-5 w-5 text-cyan" />,
  success: <CheckCircle2 className="h-5 w-5 text-mint" />,
  warn: <AlertTriangle className="h-5 w-5 text-amber" />,
  error: <XCircle className="h-5 w-5 text-rose" />
}

export function Toasts() {
  const { toasts, dismiss } = useStore()
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9 }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.4 }}
            className="glass pointer-events-auto flex items-start gap-3 rounded-2xl p-3.5"
          >
            {TOAST_ICON[t.kind]}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.detail && <div className="mt-0.5 break-words text-xs text-ink-dim">{t.detail}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="no-drag text-ink-faint hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function SourceTile({ glyph, color, size = 44 }: { glyph: string; color: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold"
      style={{
        width: size,
        height: size,
        color,
        background: `linear-gradient(150deg, ${color}33, ${color}0d)`,
        border: `1px solid ${color}40`,
        fontSize: size * 0.34
      }}
    >
      {glyph}
    </div>
  )
}
