import { motion } from 'framer-motion'
import { Boxes, BrainCircuit, History, Import as ImportIcon, LayoutDashboard, Lock, MessagesSquare, Minus, Plug, Settings as Cog, Square, X } from 'lucide-react'
import clsx from 'clsx'
import { api, isMock } from '../lib/api'
import { useStore, type Route } from '../store/useStore'

const NAV: { id: Route; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'snapshots', label: 'Snapshots', icon: History },
  { id: 'browse', label: 'Chats', icon: MessagesSquare },
  { id: 'import', label: 'Import', icon: ImportIcon },
  { id: 'brain', label: 'Brain', icon: BrainCircuit },
  { id: 'connect', label: 'Connect', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Cog }
]

export function TitleBar() {
  const vault = useStore((s) => s.vault)
  return (
    // z-50: must stay above VaultGate's lock overlay (z-40) — on a frameless
    // window these minimize/maximize/close buttons are the only way to control
    // the window, so they can't be obscured while the vault is locked.
    <div className="drag relative z-50 flex h-12 items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg accent-grad ring-glow">
          <Boxes className="h-4 w-4 text-white" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-bold tracking-tight text-grad">RELIQUA</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-ink-faint">vault</span>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <span
            className={clsx('h-1.5 w-1.5 rounded-full', vault.open ? 'bg-mint' : 'bg-ink-faint')}
            style={vault.open ? { boxShadow: '0 0 10px #34d399' } : undefined}
          />
          <span className="text-xs text-ink-dim">{vault.open ? vault.name : 'locked'}</span>
        </div>
      </div>

      <div className="no-drag flex items-center gap-1">
        {isMock && (
          <span className="mr-2 rounded-full border border-amber/30 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
            preview
          </span>
        )}
        <WinBtn onClick={() => api.minimize()}><Minus className="h-3.5 w-3.5" /></WinBtn>
        <WinBtn onClick={() => api.toggleMaximize()}><Square className="h-3 w-3" /></WinBtn>
        <WinBtn onClick={() => api.close()} danger><X className="h-3.5 w-3.5" /></WinBtn>
      </div>
    </div>
  )
}

function WinBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex h-7 w-9 items-center justify-center rounded-md text-ink-dim transition-colors',
        danger ? 'hover:bg-rose/80 hover:text-white' : 'hover:bg-white/10 hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

export function Sidebar() {
  const { route, setRoute, vault, lockVault } = useStore()
  return (
    <nav className="relative z-10 flex w-[208px] shrink-0 flex-col gap-1 px-3 pb-4">
      <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        Navigate
      </div>
      {NAV.map((n) => {
        const active = route === n.id
        const Icon = n.icon
        return (
          <button
            key={n.id}
            onClick={() => setRoute(n.id)}
            className="no-drag relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
          >
            {active && (
              <motion.div
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl border border-white/10 bg-white/8"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className={clsx('relative h-[18px] w-[18px]', active ? 'text-iris' : 'text-ink-faint')} />
            <span className={clsx('relative', active ? 'text-ink' : 'text-ink-dim')}>{n.label}</span>
          </button>
        )
      })}

      <div className="mt-auto px-1">
        {vault.open && (
          <button
            onClick={lockVault}
            className="no-drag flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-dim transition-colors hover:bg-white/6 hover:text-ink"
          >
            <Lock className="h-[18px] w-[18px]" />
            Lock vault
          </button>
        )}
      </div>
    </nav>
  )
}
