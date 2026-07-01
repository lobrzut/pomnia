import { create } from 'zustand'
import { api } from '../lib/api'
import type { ClientId, DetectedSource, Snapshot, SourceId, VaultStatus } from '../lib/types'

export type Route = 'dashboard' | 'browse' | 'import' | 'brain' | 'connect' | 'settings'

/**
 * Connect-tab client visibility override. Default behaviour shows only clients
 * we actually detect on disk (config file present); this lets the user pin a
 * not-yet-installed client to show (to set it up) or hide one they don't care
 * about. true = force show, false = force hide, absent = auto (follow detection).
 */
const CLIENT_OVERRIDE_KEY = 'reliqua.connect.clientOverride'
function loadClientOverride(): Partial<Record<ClientId, boolean>> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_OVERRIDE_KEY) : null
    return raw ? (JSON.parse(raw) as Partial<Record<ClientId, boolean>>) : {}
  } catch {
    return {}
  }
}
function saveClientOverride(o: Partial<Record<ClientId, boolean>>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLIENT_OVERRIDE_KEY, JSON.stringify(o))
  } catch {
    /* ignore quota / unavailable storage */
  }
}

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'warn' | 'error'
  title: string
  detail?: string
}

interface State {
  route: Route
  setRoute: (r: Route) => void

  scanning: boolean
  sources: DetectedSource[]
  scan: () => Promise<void>

  vault: VaultStatus
  snapshots: Snapshot[]
  refreshVault: () => Promise<void>
  createVault: (path: string, name: string, pass: string) => Promise<boolean>
  openVault: (path: string, pass: string) => Promise<boolean>
  lockVault: () => Promise<void>

  backingUp: boolean
  backupPhase: string
  selected: Set<SourceId>
  toggleSelected: (id: SourceId) => void
  selectAll: (ids: SourceId[]) => void
  backup: (note?: string) => Promise<void>

  connectClientOverride: Partial<Record<ClientId, boolean>>
  setConnectClientVisible: (id: ClientId, visible: boolean) => void
  resetConnectClient: (id: ClientId) => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useStore = create<State>((set, get) => ({
  route: 'dashboard',
  setRoute: (route) => set({ route }),

  scanning: false,
  sources: [],
  async scan() {
    set({ scanning: true })
    try {
      const sources = await api.scan()
      set({ sources })
      // Default-select every installed source.
      set({ selected: new Set(sources.filter((s) => s.installed).map((s) => s.id)) })
    } finally {
      set({ scanning: false })
    }
  },

  vault: { open: false, snapshots: 0 },
  snapshots: [],
  async refreshVault() {
    const vault = await api.vaultStatus()
    set({ vault })
    if (vault.open) set({ snapshots: await api.listSnapshots() })
    else set({ snapshots: [] })
  },
  async createVault(path, name, pass) {
    try {
      const vault = await api.createVault(path, name, pass)
      set({ vault, snapshots: [] })
      get().toast({ kind: 'success', title: 'Vault created', detail: name })
      return true
    } catch (e) {
      get().toast({ kind: 'error', title: 'Could not create vault', detail: (e as Error).message })
      return false
    }
  },
  async openVault(path, pass) {
    try {
      const vault = await api.openVault(path, pass)
      set({ vault, snapshots: await api.listSnapshots() })
      get().toast({ kind: 'success', title: 'Vault unlocked', detail: vault.name })
      return true
    } catch (e) {
      get().toast({ kind: 'error', title: 'Unlock failed', detail: (e as Error).message })
      return false
    }
  },
  async lockVault() {
    await api.lockVault()
    set({ vault: { open: false, snapshots: 0 }, snapshots: [] })
    get().toast({ kind: 'info', title: 'Vault locked' })
  },

  backingUp: false,
  backupPhase: '',
  selected: new Set<SourceId>(),
  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selected)
      next.has(id) ? next.delete(id) : next.add(id)
      return { selected: next }
    }),
  selectAll: (ids) => set({ selected: new Set(ids) }),
  async backup(note) {
    const { selected, vault } = get()
    if (!vault.open) {
      get().toast({ kind: 'warn', title: 'No vault open', detail: 'Create or unlock a vault first.' })
      return
    }
    if (selected.size === 0) {
      get().toast({ kind: 'warn', title: 'Nothing selected' })
      return
    }
    set({ backingUp: true, backupPhase: 'starting…' })
    const off = api.onBackupProgress((e) =>
      set({ backupPhase: `${e.source} · ${e.phase}${e.detail ? ' · ' + e.detail : ''}` })
    )
    try {
      const made = await api.backup([...selected], note)
      await get().refreshVault()
      const skipped = made.reduce((n, m) => n + (m.stats.skipped || 0), 0)
      get().toast({
        kind: skipped ? 'warn' : 'success',
        title: `Backed up ${made.length} source(s)`,
        detail:
          made.map((m) => m.source.label).join(', ') +
          (skipped ? ` · ${skipped} file(s) skipped (in use — close the app & re-run)` : '')
      })
    } catch (e) {
      get().toast({ kind: 'error', title: 'Backup failed', detail: (e as Error).message })
    } finally {
      off()
      set({ backingUp: false, backupPhase: '' })
    }
  },

  connectClientOverride: loadClientOverride(),
  setConnectClientVisible: (id, visible) =>
    set((s) => {
      const next = { ...s.connectClientOverride, [id]: visible }
      saveClientOverride(next)
      return { connectClientOverride: next }
    }),
  resetConnectClient: (id) =>
    set((s) => {
      const next = { ...s.connectClientOverride }
      delete next[id]
      saveClientOverride(next)
      return { connectClientOverride: next }
    }),

  toasts: [],
  toast: (t) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => get().dismiss(id), 5200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
