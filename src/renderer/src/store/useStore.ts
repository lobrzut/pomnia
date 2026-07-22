import { create } from 'zustand'
import { VRAM_PROFILES } from '@core/brain/profiles'
import {
  DEFAULT_HANDSHAKE_PHRASE,
  displayHandshakePhrase,
  isValidHandshakePhraseSetting,
} from '@core/handshakePhrase'
import { api } from '../lib/api'
import { loadBool, loadStr, migrateLegacyStorage, saveBool, saveStr } from '../lib/persist'
import { applyColorScheme, isColorScheme, type ColorScheme } from '../lib/theme'
import type { ClientId, DetectedSource, Snapshot, SourceId, VaultStatus, BrainRunResult, BrainStateInfo, ActivityState } from '../lib/types'
import { formatBrainProgressLabel, invalidateUiLabelsCache, uiLabels } from '../lib/labels'
import { isUiLocale, setUiLocaleCache, type UiLocale } from '../lib/uiLocale'

migrateLegacyStorage()

/** Same distillable set as Brain tab — live assistant sources with JSONL/DB chats. */
const DISTILLABLE_SOURCES = new Set<SourceId>(['claude-code', 'cursor', 'claude-desktop'])
const BRAIN_PROFILE_KEY = 'pomnia.brain.profile'

function loadDistillChatModel(): string {
  try {
    const id = localStorage.getItem(BRAIN_PROFILE_KEY) ?? 'standard'
    return (VRAM_PROFILES.find((p) => p.id === id) ?? VRAM_PROFILES[1]).chatModel
  } catch {
    return VRAM_PROFILES[1].chatModel
  }
}

export type Route = 'dashboard' | 'browse' | 'import' | 'brain' | 'connect' | 'settings' | 'guide'

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
const AGENT_BRAIN_MODE_KEY = 'pomnia.settings.agentBrainMode'

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
    return localStorage.getItem(REMOTE_BRAIN_URL_KEY) || ''
  } catch {
    return ''
  }
}

function hasLocalStorageKey(key: string): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function syncBrainAppSettings(patch: {
  ollamaUrl?: string
  brainMcpUrl?: string
  brainDeployUrl?: string
  brainTarget?: BrainTarget
  connectToken?: string
}): void {
  void api.appSettingsSet(patch).catch(() => {})
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
  /** Optional CTA (e.g. Start Brain after backup). */
  actionLabel?: string
  onAction?: () => void
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
  /** Returns false if vault closed, nothing selected, or backup failed. */
  backup: (note?: string, opts?: { silent?: boolean }) => Promise<boolean>
  /** Backup selected → distill (same pipeline as Brain tab). */
  backupAndDistill: (note?: string) => Promise<void>

  connectClientOverride: Partial<Record<ClientId, boolean>>
  setConnectClientVisible: (id: ClientId, visible: boolean) => void
  resetConnectClient: (id: ClientId) => void

  brainTarget: BrainTarget
  setBrainTarget: (t: BrainTarget) => void
  remoteBrainUrl: string
  setRemoteBrainUrl: (url: string) => void

  ollamaUrl: string
  setOllamaUrl: (url: string) => void

  /** Remote Brain (KVM) — auto-push distilled notes after pipeline.
   *  Embedded writes to portable vault/distilled when open (else AppData). */
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

  /**
   * Connect Brain Mode — include agent rule snippet + instruct MCP loop.
   * Not Desktop auto-capture of chats.
   */
  agentBrainMode: boolean
  setAgentBrainMode: (on: boolean) => void

  /** Tray — main-process settings mirrored here for the Settings UI. */
  minimizeToTray: boolean
  closeToTray: boolean
  floatingMonitorOnMinimize: boolean
  openAtLogin: boolean
  colorScheme: ColorScheme
  uiLocale: UiLocale
  handshakePhrase: string
  handshakeEnabled: boolean
  setMinimizeToTray: (on: boolean) => void
  setCloseToTray: (on: boolean) => void
  setFloatingMonitorOnMinimize: (on: boolean) => void
  setOpenAtLogin: (on: boolean) => void
  setColorScheme: (scheme: ColorScheme) => void
  setUiLocale: (locale: UiLocale) => void
  setHandshakePhrase: (phrase: string) => Promise<{ ok: boolean; phrase: string }>
  setHandshakeEnabled: (on: boolean) => void
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
    void api.appSettingsSet({ onboarded: true }).catch(() => {})
    set({ onboarded: true })
  },

  scanning: false,
  sources: [],
  async scan() {
    set({ scanning: true })
    try {
      const sources = await api.scan()
      set({ sources })
      // All installed sources — same default. Oversized Cursor still backups; chat count may be 0 (note on tile).
      set({
        selected: new Set(sources.filter((s) => s.installed).map((s) => s.id))
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
      // Refresh so skillsCount / distilledNotes match vault:status (open may omit older fields).
      await get().refreshVault()
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
      await get().refreshVault()
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
  async backup(note, opts) {
    const labels = uiLabels()
    const { selected, vault } = get()
    if (!vault.open) {
      get().toast({ kind: 'warn', title: labels.dashboardNoVaultTitle, detail: labels.dashboardNoVaultDetail })
      return false
    }
    if (selected.size === 0) {
      get().toast({ kind: 'warn', title: labels.dashboardNothingSelected })
      return false
    }
    set({ backingUp: true, backupPhase: labels.dashboardBackupStarting })
    const off = api.onBackupProgress((e) =>
      set({ backupPhase: `${e.source} · ${e.phase}${e.detail ? ' · ' + e.detail : ''}` })
    )
    try {
      const made = await api.backup([...selected], note)
      await get().refreshVault()
      if (!opts?.silent) {
        const skipped = made.reduce((n, m) => n + (m.stats.skipped || 0), 0)
        get().toast({
          kind: skipped ? 'warn' : 'success',
          title: skipped
            ? labels.dashboardBackupDoneSkipped(skipped)
            : labels.dashboardBackupDone(made.length),
          detail: skipped
            ? `${made.map((m) => m.source.label).join(', ')} · ${labels.dashboardBackupSkippedHint}`
            : made.map((m) => m.source.label).join(', ')
        })
      }
      return true
    } catch (e) {
      get().toast({ kind: 'error', title: labels.dashboardBackupFailed, detail: (e as Error).message })
      return false
    } finally {
      off()
      set({ backingUp: false, backupPhase: '' })
    }
  },

  async backupAndDistill(note) {
    const labels = uiLabels()
    const ok = await get().backup(note, { silent: true })
    if (!ok) return

    const distillable = [...get().selected].filter((id) => DISTILLABLE_SOURCES.has(id))
    if (distillable.length === 0) {
      get().toast({
        kind: 'info',
        title: labels.dashboardNoDistillSourcesTitle,
        detail: labels.dashboardNoDistillSourcesDetail
      })
      return
    }

    // Embedded: MCP reindex after distill needs brain-core. Offer Start; backup already done.
    if (get().brainTarget === 'embedded') {
      let running = false
      try {
        running = !!(await api.brainCoreStatus()).running
      } catch {
        running = false
      }
      if (!running) {
        get().toast({
          kind: 'warn',
          title: labels.dashboardBrainOffTitle,
          detail: labels.dashboardBrainOffDetail,
          actionLabel: labels.embeddedBrainStart,
          onAction: () => {
            void (async () => {
              try {
                await api.brainCoreStart(get().ollamaUrl || undefined)
                get().toast({ kind: 'success', title: labels.dashboardBrainStarted })
                // Same as Brain "Przygotuj pamięć (N nowych)": only ledger-pending chats.
                await get().runBrainPipeline({
                  sources: distillable,
                  model: loadDistillChatModel(),
                  ollamaUrl: get().ollamaUrl,
                  pendingOnly: true
                })
              } catch (e) {
                get().toast({
                  kind: 'error',
                  title: labels.dashboardBrainStartFailed,
                  detail: (e as Error).message
                })
              }
            })()
          }
        })
        return
      }
    }

    // Incremental: skip already-ledgered sessions (isWorthDistilling still skips trivia).
    await get().runBrainPipeline({
      sources: distillable,
      model: loadDistillChatModel(),
      ollamaUrl: get().ollamaUrl,
      pendingOnly: true
    })
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
    syncBrainAppSettings({ brainTarget })
    set({ brainTarget })
  },

  remoteBrainUrl: loadRemoteBrainUrl(),
  setRemoteBrainUrl: (remoteBrainUrl) => {
    try {
      if (remoteBrainUrl) localStorage.setItem(REMOTE_BRAIN_URL_KEY, remoteBrainUrl)
      else localStorage.removeItem(REMOTE_BRAIN_URL_KEY)
    } catch {
      /* ignore */
    }
    syncBrainAppSettings({ brainMcpUrl: remoteBrainUrl || undefined })
    set({ remoteBrainUrl })
  },

  ollamaUrl: loadOllamaUrl(),
  setOllamaUrl: (ollamaUrl) => {
    saveOllamaUrl(ollamaUrl)
    syncBrainAppSettings({ ollamaUrl: ollamaUrl || undefined })
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
    syncBrainAppSettings({ brainDeployUrl: brainDeployUrl || undefined })
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
    syncBrainAppSettings({ connectToken: connectToken || undefined })
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

  agentBrainMode: loadBool(AGENT_BRAIN_MODE_KEY, false),
  setAgentBrainMode: (agentBrainMode) => {
    saveBool(AGENT_BRAIN_MODE_KEY, agentBrainMode)
    set({ agentBrainMode })
  },

  minimizeToTray: false,
  closeToTray: true,
  floatingMonitorOnMinimize: true,
  openAtLogin: false,
  colorScheme: 'mint',
  uiLocale: 'pl',
  handshakePhrase: DEFAULT_HANDSHAKE_PHRASE,
  handshakeEnabled: true,
  async loadAppSettings() {
    try {
      const s = await api.appSettings()
      const state = get()

      // Hydrate from app-settings when localStorage has no value (migration / new machine).
      // Existing localStorage values (incl. alice's brain.example.local) are never overwritten.
      if (!hasLocalStorageKey(REMOTE_BRAIN_URL_KEY) && s.brainMcpUrl) {
        try {
          localStorage.setItem(REMOTE_BRAIN_URL_KEY, s.brainMcpUrl)
        } catch {
          /* ignore */
        }
      }
      if (!hasLocalStorageKey(BRAIN_TARGET_KEY) && s.brainTarget) {
        try {
          localStorage.setItem(BRAIN_TARGET_KEY, s.brainTarget)
        } catch {
          /* ignore */
        }
      }
      if (!hasLocalStorageKey(BRAIN_DEPLOY_URL_KEY) && s.brainDeployUrl) {
        saveStr(BRAIN_DEPLOY_URL_KEY, s.brainDeployUrl)
      }
      if (!hasLocalStorageKey(CONNECT_TOKEN_KEY) && s.connectToken) {
        saveStr(CONNECT_TOKEN_KEY, s.connectToken)
      }
      if (!hasLocalStorageKey(OLLAMA_URL_KEY) && s.ollamaUrl) {
        saveOllamaUrl(s.ollamaUrl)
      }

      const remoteBrainUrl = state.remoteBrainUrl || s.brainMcpUrl || loadRemoteBrainUrl()
      const brainTarget = hasLocalStorageKey(BRAIN_TARGET_KEY)
        ? state.brainTarget
        : (s.brainTarget ?? state.brainTarget)
      const brainDeployUrl = state.brainDeployUrl || s.brainDeployUrl || loadBrainDeployUrl()
      const connectToken = state.connectToken || s.connectToken || loadStr(CONNECT_TOKEN_KEY)
      const ollamaUrl = state.ollamaUrl || s.ollamaUrl || ''
      const colorScheme = isColorScheme(s.colorScheme) ? s.colorScheme : 'mint'
      applyColorScheme(colorScheme)
      const uiLocale = isUiLocale(s.uiLocale) ? s.uiLocale : 'pl'
      setUiLocaleCache(uiLocale)
      invalidateUiLabelsCache()
      const handshakePhrase =
        typeof s.handshakePhrase === 'string' && s.handshakePhrase.trim()
          ? displayHandshakePhrase(s.handshakePhrase)
          : DEFAULT_HANDSHAKE_PHRASE
      const handshakeEnabled = s.handshakeEnabled !== false

      set({
        minimizeToTray: s.minimizeToTray,
        closeToTray: s.closeToTray,
        floatingMonitorOnMinimize: s.floatingMonitorOnMinimize !== false,
        openAtLogin: !!s.openAtLogin,
        colorScheme,
        uiLocale,
        handshakePhrase,
        handshakeEnabled,
        ollamaUrl,
        remoteBrainUrl,
        brainTarget,
        brainDeployUrl,
        connectToken,
      })
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
  setFloatingMonitorOnMinimize: (floatingMonitorOnMinimize) => {
    void api.appSettingsSet({ floatingMonitorOnMinimize }).then((s) =>
      set({ floatingMonitorOnMinimize: s.floatingMonitorOnMinimize !== false }),
    )
  },
  setOpenAtLogin: (openAtLogin) => {
    void api.appSettingsSet({ openAtLogin }).then((s) => set({ openAtLogin: !!s.openAtLogin }))
  },
  setColorScheme: (scheme) => {
    const colorScheme = isColorScheme(scheme) ? scheme : 'mint'
    applyColorScheme(colorScheme)
    set({ colorScheme })
    void api.appSettingsSet({ colorScheme }).then((s) => {
      const next = isColorScheme(s.colorScheme) ? s.colorScheme : colorScheme
      applyColorScheme(next)
      set({ colorScheme: next })
    })
  },
  setUiLocale: (locale) => {
    const uiLocale = isUiLocale(locale) ? locale : 'pl'
    setUiLocaleCache(uiLocale)
    invalidateUiLabelsCache()
    set({ uiLocale })
    void api.appSettingsSet({ uiLocale }).then((s) => {
      const next = isUiLocale(s.uiLocale) ? s.uiLocale : uiLocale
      setUiLocaleCache(next)
      invalidateUiLabelsCache()
      set({ uiLocale: next })
    })
  },
  async setHandshakePhrase(phrase) {
    const trimmed = phrase.trim()
    if (!trimmed || !isValidHandshakePhraseSetting(trimmed)) {
      return { ok: false, phrase: get().handshakePhrase }
    }
    const s = await api.appSettingsSet({ handshakePhrase: trimmed })
    const next =
      typeof s.handshakePhrase === 'string' && s.handshakePhrase.trim()
        ? displayHandshakePhrase(s.handshakePhrase)
        : displayHandshakePhrase(trimmed)
    set({ handshakePhrase: next })
    return { ok: true, phrase: next }
  },
  setHandshakeEnabled: (handshakeEnabled) => {
    void api.appSettingsSet({ handshakeEnabled }).then((s) =>
      set({ handshakeEnabled: s.handshakeEnabled !== false }),
    )
  },

  brainRunning: false,
  brainProgress: null,
  brainResult: null,
  globalActivity: { kind: 'idle' },
  initGlobalActivity() {
    void api.activityGet().then((s) => set({ globalActivity: s })).catch(() => {})
    const offUpdate = api.onActivityUpdate((s) => set({ globalActivity: s }))
    const offIdle = api.onActivityIdle(() =>
      set((s) => ({
        globalActivity: { kind: 'idle' },
        ...(s.brainRunning ? { brainRunning: false, brainProgress: null } : {}),
      })),
    )
    const offLibrary = api.onLibraryIndexComplete(() => {
      void get().refreshVault()
    })
    return () => {
      offUpdate()
      offIdle()
      offLibrary()
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
    const off = api.onBrainProgress((e) => {
      if (e.phase === 'idle') {
        set({ brainProgress: null })
        return
      }
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
    })
    try {
      const s = get()
      // Remote: optional push to KVM. Embedded vault sync is unconditional in main.
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
      const labels = uiLabels()
      if (r.emptyBacklog) {
        get().toast({
          kind: 'info',
          title: labels.distillEmptyBacklog,
          detail: labels.distillEmptyBacklogDetail,
        })
        return
      }
      const fail = r.failed ?? 0
      const deploy =
        r.deployed > 0
          ? s.brainTarget === 'embedded'
            ? ` · ${r.deployed} → vault/distilled`
            : ` · ${r.deployed} deployed to Brain`
          : ''
      const reidx = r.reindexed
        ? ' · reindexed'
        : autoDeploy && r.deployMethod !== 'none' && !r.reindexed
          ? ' · reindex failed'
          : ''
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
      void get().refreshVault()
    }
  },
  cancelBrainPipeline() {
    void api.brainRunCancel()
  },

  toasts: [],
  toast: (t) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    // Longer linger when there's a CTA (e.g. Start Brain after backup).
    setTimeout(() => get().dismiss(id), t.actionLabel ? 12_000 : 5200)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
