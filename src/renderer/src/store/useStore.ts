import { create } from 'zustand'
import { api } from '../lib/api'
import { loadBool, loadStr, migrateLegacyStorage, saveBool, saveStr } from '../lib/persist'
import type { ClientId, DetectedSource, Snapshot, SourceId, VaultStatus, BrainRunResult, BrainStateInfo, ActivityState } from '../lib/types'
import { formatBrainProgressLabel } from '../lib/labels'

migrateLegacyStorage()

export type Route = 'dashboard' | 'browse' | 'import' | 'brain' | 'connect' | 'settings'

/**
 * Connect-tab client visibility override. Default behaviour shows only clients
 * we actually detect on disk (config file present); this lets the user pin a
 * not-yet-installed client to show (to set it up) or hide one they don't care
 * about. true = force show, false = force hide, absent = auto (follow detection).
 */
const CLIENT_OVERRIDE_KEY = 'pomnia.connect.clientOverride'
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

/** First-run flag — once true the onboarding wizard never shows again. */
const ONBOARDED_KEY = 'pomnia.onboarded'
const BRAIN_TARGET_KEY = 'pomnia.brain.target'
const REMOTE_BRAIN_URL_KEY = 'pomnia.brain.remoteUrl'
const OLLAMA_URL_KEY = 'pomnia.brain.ollamaUrl'

export type BrainTarget = 'embedded' | 'remote'

function loadOllamaUrl(): string {
  try {
    return localStorage.getItem(OLLAMA_URL_KEY) || ''
  } catch {
    return ''
  }
}

function saveOllamaUrl(url: string): void {
  try {
    if (url) localStorage.setItem(OLLAMA_URL_KEY, url)
    else localStorage.removeItem(OLLAMA_URL_KEY)
  } catch {
    /* ignore */
  }
}

/** Same host as remote Brain MCP, dashboard API port. */
export function dashboardUrlFromBrainUrl(brainUrl: string): string {
  try {
    const u = new URL(brainUrl)
    u.port = '7860'
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return brainUrl.replace(/:7862\b/, ':7860').replace(/\/+$/, '')
  }
}

const BRAIN_AUTO_DEPLOY_KEY = 'pomnia.brain.autoDeploy'
const BRAIN_DEPLOY_URL_KEY = 'pomnia.brain.deployUrl'
const BRAIN_DEPLOY_TARGET_KEY = 'pomnia.brain.deployTarget'
const BRAIN_DEPLOY_REINDEX_KEY = 'pomnia.brain.deployReindex'
const CONNECT_TOKEN_KEY = 'pomnia.connect.token'
const VAULT_PATH_KEY = 'pomnia.vault.lastPath'
const BACKUP_NOTE_KEY = 'pomnia.backup.note'
const SETTINGS_EXPORT_DIR_KEY = 'pomnia.settings.exportDir'
const SIMPLE_MODE_KEY = 'pomnia.settings.simpleMode'

function loadBrainAutoDeploy(): boolean {
  try {
    const v = localStorage.getItem(BRAIN_AUTO_DEPLOY_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

function loadBrainDeployUrl(): string {
  const saved = loadStr(BRAIN_DEPLOY_URL_KEY)
  if (saved) return saved
  return dashboardUrlFromBrainUrl(loadRemoteBrainUrl())
}

function loadBrainDeployTarget(): string {
  return loadStr(BRAIN_DEPLOY_TARGET_KEY)
}

/** Same host as remote Brain MCP, default Ollama port. */
export function ollamaUrlFromBrainUrl(brainUrl: string): string {
  try {
    const u = new URL(brainUrl)
    u.port = '11434'
    u.pathname = ''
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return brainUrl.replace(/:\d+(\/.*)?$/, ':11434')
  }
}

function loadRemoteBrainUrl(): string {
  try {
    return localStorage.getItem(REMOTE_BRAIN_URL_KEY) || 'http://brain.example.local:7862'
  } catch {
    return 'http://brain.example.local:7862'
  }
}

function loadBrainTarget(): BrainTarget {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(BRAIN_TARGET_KEY) : null
    return v === 'remote' ? 'remote' : 'embedded'
  } catch {
    return 'embedded'
  }
}
function loadOnboarded(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true // storage unavailable — fail open, never trap the user in the wizard
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

  onboarded: boolean
  completeOnboarding: () => void

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

  brainTarget: BrainTarget
  setBrainTarget: (t: BrainTarget) => void
  remoteBrainUrl: string
  setRemoteBrainUrl: (url: string) => void

  ollamaUrl: string
  setOllamaUrl: (url: string) => void

  /** Remote Brain (KVM) — auto-push distilled notes after pipeline. */
  brainAutoDeploy: boolean
  setBrainAutoDeploy: (on: boolean) => void
  brainDeployUrl: string
  setBrainDeployUrl: (url: string) => void
  brainDeployTarget: string
  setBrainDeployTarget: (path: string) => void
  brainDeployReindex: boolean
  setBrainDeployReindex: (on: boolean) => void

  connectToken: string
  setConnectToken: (token: string) => void

  vaultLastPath: string
  setVaultLastPath: (path: string) => void

  backupNote: string
  setBackupNote: (note: string) => void

  settingsExportDir: string
  setSettingsExportDir: (dir: string) => void

  /** Progressive disclosure — hides remote brain, deploy, VRAM profiles by default. */
  simpleMode: boolean
  setSimpleMode: (on: boolean) => void

  /** Tray — main-process settings mirrored here for the Settings UI. */
  minimizeToTray: boolean
  closeToTray: boolean
  setMinimizeToTray: (on: boolean) => void
  setCloseToTray: (on: boolean) => void
  loadAppSettings: () => Promise<void>

  /** Distill pipeline — lives in the store so progress survives tab switches. */
  brainRunning: boolean
  brainProgress: { label: string; pct: number; phase?: string } | null
  brainResult: BrainRunResult | null
  globalActivity: ActivityState
  initGlobalActivity: () => () => void
  brainState: BrainStateInfo | null
  brainStateLoading: boolean
  loadBrainState: () => Promise<void>
  runBrainPipeline: (opts: {
    sources: SourceId[]
    model: string
    ollamaUrl: string
    importPath?: string
    pendingOnly?: boolean
  }) => Promise<void>
  cancelBrainPipeline: () => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useStore = create<State>((set, get) => ({
  route: 'dashboard',
  setRoute: (route) => set({ route }),

  onboarded: loadOnboarded(),
  completeOnboarding: () => {
    try {
      localStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      /* storage unavailable — flag stays in-memory for this session */
    }
    set({ onboarded: true })
  },

  scanning: false,
  sources: [],
  async scan() {
    set({ scanning: true })
    try {
      const sources = await api.scan()
      set({ sources })
      // Default-select installed sources; skip Cursor when chat parse is disabled (oversized state.vscdb).
      const tooLarge = (s: DetectedSource) =>
        s.id === 'cursor' && s.notes?.some((n) => n.includes('parse skipped'))
      set({
        selected: new Set(sources.filter((s) => s.installed && !tooLarge(s)).map((s) => s.id))
      })
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
      saveStr(VAULT_PATH_KEY, path)
      set({ vault, snapshots: [], vaultLastPath: path })
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
      saveStr(VAULT_PATH_KEY, path)
      set({ vault, snapshots: await api.listSnapshots(), vaultLastPath: path })
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
        title: skipped
          ? `Backup done — ${skipped} locked file(s) skipped`
          : `Backed up ${made.length} source(s)`,
        detail: skipped
          ? `${made.map((m) => m.source.label).join(', ')} · close running apps & backup again for full capture`
          : made.map((m) => m.source.label).join(', ')
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

  brainTarget: loadBrainTarget(),
  setBrainTarget: (brainTarget) => {
    try {
      localStorage.setItem(BRAIN_TARGET_KEY, brainTarget)
    } catch {
      /* ignore */
    }
    set({ brainTarget })
  },

  remoteBrainUrl: loadRemoteBrainUrl(),
  setRemoteBrainUrl: (remoteBrainUrl) => {
    try {
      localStorage.setItem(REMOTE_BRAIN_URL_KEY, remoteBrainUrl)
    } catch {
      /* ignore */
    }
    set({ remoteBrainUrl })
  },

  ollamaUrl: loadOllamaUrl(),
  setOllamaUrl: (ollamaUrl) => {
    saveOllamaUrl(ollamaUrl)
    void api.appSettingsSet({ ollamaUrl: ollamaUrl || undefined }).catch(() => {})
    set({ ollamaUrl })
  },

  brainAutoDeploy: loadBrainAutoDeploy(),
  setBrainAutoDeploy: (brainAutoDeploy) => {
    try {
      localStorage.setItem(BRAIN_AUTO_DEPLOY_KEY, brainAutoDeploy ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ brainAutoDeploy })
  },
  brainDeployUrl: loadBrainDeployUrl(),
  setBrainDeployUrl: (brainDeployUrl) => {
    saveStr(BRAIN_DEPLOY_URL_KEY, brainDeployUrl)
    set({ brainDeployUrl })
  },
  brainDeployTarget: loadBrainDeployTarget(),
  setBrainDeployTarget: (brainDeployTarget) => {
    saveStr(BRAIN_DEPLOY_TARGET_KEY, brainDeployTarget)
    set({ brainDeployTarget })
  },
  brainDeployReindex: loadBool(BRAIN_DEPLOY_REINDEX_KEY, true),
  setBrainDeployReindex: (brainDeployReindex) => {
    saveBool(BRAIN_DEPLOY_REINDEX_KEY, brainDeployReindex)
    set({ brainDeployReindex })
  },

  connectToken: loadStr(CONNECT_TOKEN_KEY),
  setConnectToken: (connectToken) => {
    saveStr(CONNECT_TOKEN_KEY, connectToken)
    set({ connectToken })
  },

  vaultLastPath: loadStr(VAULT_PATH_KEY),
  setVaultLastPath: (vaultLastPath) => {
    saveStr(VAULT_PATH_KEY, vaultLastPath)
    set({ vaultLastPath })
  },

  backupNote: loadStr(BACKUP_NOTE_KEY),
  setBackupNote: (backupNote) => {
    saveStr(BACKUP_NOTE_KEY, backupNote)
    set({ backupNote })
  },

  settingsExportDir: loadStr(SETTINGS_EXPORT_DIR_KEY),
  setSettingsExportDir: (settingsExportDir) => {
    saveStr(SETTINGS_EXPORT_DIR_KEY, settingsExportDir)
    set({ settingsExportDir })
  },

  simpleMode: loadBool(SIMPLE_MODE_KEY, true),
  setSimpleMode: (simpleMode) => {
    saveBool(SIMPLE_MODE_KEY, simpleMode)
    set({ simpleMode })
  },

  minimizeToTray: false,
  closeToTray: true,
  async loadAppSettings() {
    try {
      const s = await api.appSettings()
      set((state) => ({
        minimizeToTray: s.minimizeToTray,
        closeToTray: s.closeToTray,
        ollamaUrl: state.ollamaUrl || s.ollamaUrl || '',
      }))
      if (!get().ollamaUrl && s.ollamaUrl) {
        saveOllamaUrl(s.ollamaUrl)
      }
    } catch {
      /* preview mode / unavailable */
    }
  },
  setMinimizeToTray: (minimizeToTray) => {
    void api.appSettingsSet({ minimizeToTray }).then((s) => set({ minimizeToTray: s.minimizeToTray }))
  },
  setCloseToTray: (closeToTray) => {
    void api.appSettingsSet({ closeToTray }).then((s) => set({ closeToTray: s.closeToTray }))
  },

  brainRunning: false,
  brainProgress: null,
  brainResult: null,
  globalActivity: { kind: 'idle' },
  initGlobalActivity() {
    void api.activityGet().then((s) => set({ globalActivity: s })).catch(() => {})
    const offUpdate = api.onActivityUpdate((s) => set({ globalActivity: s }))
    const offIdle = api.onActivityIdle(() => set({ globalActivity: { kind: 'idle' } }))
    return () => {
      offUpdate()
      offIdle()
    }
  },
  brainState: null,
  brainStateLoading: false,
  async loadBrainState() {
    set({ brainStateLoading: true })
    try {
      set({ brainState: await api.brainState() })
    } catch {
      set({ brainState: null })
    } finally {
      set({ brainStateLoading: false })
    }
  },
  async runBrainPipeline(opts) {
    if (get().brainRunning) return
    set({ brainRunning: true, brainProgress: { label: 'uruchamianie…', pct: 4, phase: 'start' }, brainResult: null })
    const off = api.onBrainProgress((e) =>
      set({
        brainProgress: {
          label: e.label ?? formatBrainProgressLabel(e.phase, e.detail),
          phase: e.phase,
          pct:
            e.phase === 'deploy'
              ? 96
              : e.total
                ? Math.min(
                    95,
                    Math.round(((e.done + (e.detail?.endsWith('…') ? 0.35 : 0)) / e.total) * 100)
                  )
                : 0
        }
      })
    )
    try {
      const s = get()
      const autoDeploy = s.brainTarget === 'remote' && s.brainAutoDeploy
      const r = await api.brainRun({
        sources: opts.sources,
        model: opts.model,
        ollamaUrl: opts.ollamaUrl,
        importPath: opts.importPath,
        pendingOnly: opts.pendingOnly,
        autoDeploy,
        deployUrl: s.brainDeployUrl || dashboardUrlFromBrainUrl(s.remoteBrainUrl),
        deployTarget: s.brainDeployTarget || undefined,
        deployToken: s.connectToken || undefined,
        reindex: true
      })
      set({ brainResult: r })
      const fail = r.failed ?? 0
      const deploy = r.deployed ? ` · ${r.deployed} deployed to Brain` : ''
      const reidx = r.reindexed ? ' · reindexed' : r.deployMethod && r.deployMethod !== 'none' && !r.reindexed ? ' · reindex failed' : ''
      get().toast({
        kind: fail || (autoDeploy && r.deployMethod === 'none') ? 'warn' : 'success',
        title: fail ? `Distill done — ${fail} chat(s) timed out` : 'Distill complete',
        detail: `${r.notes} notes · ${r.chunks} chunks${deploy}${reidx}${fail ? ' · retry backlog for the rest' : ''}${
          autoDeploy && r.deployMethod === 'none' ? ' · set deploy folder on Brain tab' : ''
        }`
      })
    } catch (e) {
      const msg = (e as Error).message
      get().toast({
        kind: msg.includes('cancelled') ? 'info' : 'error',
        title: msg.includes('cancelled') ? 'Distill cancelled' : 'Pipeline failed',
        detail: msg.includes('cancelled') ? undefined : msg
      })
    } finally {
      off()
      set({ brainRunning: false, brainProgress: null })
      void get().loadBrainState()
    }
  },
  cancelBrainPipeline() {
    void api.brainRunCancel()
  },

  toasts: [],
  toast: (t) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    setTimeout(() => get().dismiss(id), 5200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
