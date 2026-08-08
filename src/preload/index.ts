// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

const bridge = {
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  scan: () => ipcRenderer.invoke('scan'),
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  pickDirectory: () => ipcRenderer.invoke('vault:pickDir'),
  pickFile: () => ipcRenderer.invoke('pick:file'),
  pickDocFile: () => ipcRenderer.invoke('pick:docFile'),
  createVault: (path: string, name: string, pass: string) => ipcRenderer.invoke('vault:create', path, name, pass),
  openVault: (path: string, pass: string) => ipcRenderer.invoke('vault:open', path, pass),
  lockVault: () => ipcRenderer.invoke('vault:lock'),
  listSnapshots: () => ipcRenderer.invoke('snapshots:list'),
  backup: (sources: string[], note?: string) => ipcRenderer.invoke('backup', sources, note),
  onBackupProgress: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('backup:progress', l)
    return () => ipcRenderer.removeListener('backup:progress', l)
  },
  verify: () => ipcRenderer.invoke('verify'),
  getConversations: (id: string) => ipcRenderer.invoke('conversations', id),
  vaultConversations: () => ipcRenderer.invoke('vault:conversations'),
  vaultConversation: (snapshotId: string, id: string) => ipcRenderer.invoke('vault:conversation', snapshotId, id),
  vaultSearchText: (query: string) => ipcRenderer.invoke('vault:searchText', query),
  importToVault: (p: string) => ipcRenderer.invoke('import:toVault', p),
  importPreview: (p: string) => ipcRenderer.invoke('import:preview', p),
  distilledQuarantineList: () => ipcRenderer.invoke('distilled:quarantineList'),
  distilledQuarantineRead: (bucket: 'review' | 'weak', name: string) =>
    ipcRenderer.invoke('distilled:quarantineRead', bucket, name),
  distilledQuarantinePromote: (bucket: 'review' | 'weak', name: string) =>
    ipcRenderer.invoke('distilled:quarantinePromote', bucket, name),
  distilledQuarantineDelete: (bucket: 'review' | 'weak', name: string) =>
    ipcRenderer.invoke('distilled:quarantineDelete', bucket, name),
  distilledQuarantineDeleteReview: (names: string[]) =>
    ipcRenderer.invoke('distilled:quarantineDeleteReview', names),
  docImport: (p?: string, ollamaUrl?: string) => ipcRenderer.invoke('doc:import', p, ollamaUrl),
  docOcr: (docId: string, ollamaUrl?: string) => ipcRenderer.invoke('doc:ocr', docId, ollamaUrl),
  docList: () => ipcRenderer.invoke('doc:list'),
  docRemove: (docId: string) => ipcRenderer.invoke('doc:remove', docId),
  brainExport: (id: string, outDir: string) => ipcRenderer.invoke('brain:export', id, outDir),
  revealPath: (p: string) => ipcRenderer.invoke('reveal', p),
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsReveal: (target: string, mode?: 'file' | 'folder') =>
    ipcRenderer.invoke('skills:reveal', target, mode ?? 'file'),
  revealInstallDir: () => ipcRenderer.invoke('reveal:installDir'),
  brainStatus: (ollamaUrl?: string) => ipcRenderer.invoke('brain:status', ollamaUrl),
  brainRun: (opts: unknown) => ipcRenderer.invoke('brain:run', opts),
  brainRunCancel: () => ipcRenderer.invoke('brain:runCancel'),
  brainState: () => ipcRenderer.invoke('brain:state'),
  brainCoreStatus: () => ipcRenderer.invoke('brainCore:status'),
  brainCoreStart: (ollamaUrl?: string) => ipcRenderer.invoke('brainCore:start', ollamaUrl),
  brainCoreStop: () => ipcRenderer.invoke('brainCore:stop'),
  brainCoreReindex: () => ipcRenderer.invoke('brainCore:reindex'),
  brainCoreCancelIndex: () => ipcRenderer.invoke('brainCore:cancelIndex'),
  vaultHealth: () => ipcRenderer.invoke('vault:health'),
  doctorRun: (opts?: { distillModel?: string; ollamaUrl?: string }) =>
    ipcRenderer.invoke('doctor:run', opts),
  onVaultHealth: (cb: (r: unknown) => void) => {
    const h = (_e: IpcRendererEvent, r: unknown) => cb(r)
    ipcRenderer.on('vault:health', h)
    return () => ipcRenderer.removeListener('vault:health', h)
  },
  onBrainCoreEvent: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('brainCore:event', l)
    return () => ipcRenderer.removeListener('brainCore:event', l)
  },
  onBrainProgress: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('brain:progress', l)
    return () => ipcRenderer.removeListener('brain:progress', l)
  },
  brainSearch: (query: string, ollamaUrl?: string) => ipcRenderer.invoke('brain:search', query, ollamaUrl),
  ollamaPull: (model: string, ollamaUrl?: string) => ipcRenderer.invoke('ollama:pull', model, ollamaUrl),
  ollamaPullCancel: () => ipcRenderer.invoke('ollama:pullCancel'),
  onOllamaPullProgress: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('ollama:pull:progress', l)
    return () => ipcRenderer.removeListener('ollama:pull:progress', l)
  },
  onDocImportProgress: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('doc:import-progress', l)
    return () => ipcRenderer.removeListener('doc:import-progress', l)
  },
  onLibraryIndexComplete: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('library:index-complete', l)
    return () => ipcRenderer.removeListener('library:index-complete', l)
  },
  activityGet: () => ipcRenderer.invoke('activity:get'),
  activityLastReplay: () => ipcRenderer.invoke('activity:lastReplay'),
  mcpActivityWatch: (active: boolean) => ipcRenderer.invoke('mcpActivity:watch', active),
  onActivityUpdate: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('activity:update', l)
    return () => ipcRenderer.removeListener('activity:update', l)
  },
  onActivityIdle: (cb: () => void) => {
    const l = () => cb()
    ipcRenderer.on('activity:idle', l)
    return () => ipcRenderer.removeListener('activity:idle', l)
  },
  brainDeploy: (opts: unknown) => ipcRenderer.invoke('brain:deploy', opts),
  appUpdateCheck: () => ipcRenderer.invoke('app:updateCheck'),
  openUserData: () => ipcRenderer.invoke('app:openUserData') as Promise<string>,
  openBrainData: () => ipcRenderer.invoke('app:openBrainData') as Promise<string>,
  appDataLocations: () => ipcRenderer.invoke('app:dataLocations'),
  vaultReplicaState: () => ipcRenderer.invoke('vault:replicaState'),
  vaultReplicaConfig: (patch: { url?: string; token?: string; autoSync?: boolean }) =>
    ipcRenderer.invoke('vault:replicaConfig', patch),
  vaultSyncToReplica: (target: string, token?: string) =>
    ipcRenderer.invoke('vault:syncToReplica', target, token),
  connectStatus: (brainUrl?: string, token?: string, target?: string) =>
    ipcRenderer.invoke('connect:status', brainUrl, token, target),
  connectSnippet: (
    clientId: string,
    brainUrl: string,
    token?: string,
    target?: string,
    brainMode?: boolean,
  ) => ipcRenderer.invoke('connect:snippet', clientId, brainUrl, token, target, brainMode),
  connectWriteBrief: (clientId: string) =>
    ipcRenderer.invoke('connect:write-brief', clientId) as Promise<
      | { ok: true; path: string; bytes: number; handshakePath?: string; agentsPath?: string }
      | { ok: false; error: string; detail?: string; path?: string }
    >,
  connectSkillsList: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsList', brainUrl, token),
  connectSkillsSync: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsSync', brainUrl, token),
  connectMcpTokenCreate: (brainUrl: string, name: string, adminToken?: string) =>
    ipcRenderer.invoke('connect:mcpTokenCreate', brainUrl, name, adminToken),
  appSettings: () => ipcRenderer.invoke('app:settings'),
  appVersion: () =>
    ipcRenderer.invoke('app:version') as Promise<{ version: string; identity: string }>,
  appSettingsSet: (patch: {
    minimizeToTray?: boolean
    closeToTray?: boolean
    ollamaUrl?: string
    brainMcpUrl?: string
    brainDeployUrl?: string
    brainTarget?: 'embedded' | 'remote'
    connectToken?: string
    embeddedBrainAutoStart?: boolean
    onboarded?: boolean
    floatingMonitorOnMinimize?: boolean
    openAtLogin?: boolean
    colorScheme?: 'mint' | 'iris' | 'glass'
    uiLocale?: 'pl' | 'en'
    handshakePhrase?: string
    handshakeEnabled?: boolean
    autoCheckpointEnabled?: boolean
  }) => ipcRenderer.invoke('app:settings:set', patch),
  onColorScheme: (cb: (scheme: 'mint' | 'iris' | 'glass') => void) => {
    const l = (_: IpcRendererEvent, scheme: 'mint' | 'iris' | 'glass') => cb(scheme)
    ipcRenderer.on('app:color-scheme', l)
    return () => ipcRenderer.removeListener('app:color-scheme', l)
  },
  onUiLocale: (cb: (locale: 'pl' | 'en') => void) => {
    const l = (_: IpcRendererEvent, locale: 'pl' | 'en') => cb(locale)
    ipcRenderer.on('app:ui-locale', l)
    return () => ipcRenderer.removeListener('app:ui-locale', l)
  },
  openLogs: () => ipcRenderer.invoke('app:openLogs') as Promise<string>,
  floatingMonitorShow: () => ipcRenderer.invoke('floating-monitor:show') as Promise<{ visible: boolean }>,
  floatingMonitorHide: () => ipcRenderer.invoke('floating-monitor:hide') as Promise<{ visible: boolean }>,
  floatingMonitorToggle: () => ipcRenderer.invoke('floating-monitor:toggle') as Promise<{ visible: boolean }>,
  floatingMonitorOpenMain: () => ipcRenderer.invoke('floating-monitor:open-main') as Promise<{ ok: boolean }>,
  floatingMonitorIsVisible: () => ipcRenderer.invoke('floating-monitor:is-visible') as Promise<{ visible: boolean }>,
  floatingMonitorGetAlwaysOnTop: () =>
    ipcRenderer.invoke('floating-monitor:get-always-on-top') as Promise<{ alwaysOnTop: boolean }>,
  floatingMonitorSetAlwaysOnTop: (on: boolean) =>
    ipcRenderer.invoke('floating-monitor:set-always-on-top', on) as Promise<{ alwaysOnTop: boolean }>,
  handshakeGetPhrase: () =>
    ipcRenderer.invoke('handshake:get-phrase') as Promise<{ phrase: string; enabled?: boolean }>,
  onHandshakePhrase: (cb: (e: { phrase: string; enabled?: boolean }) => void) => {
    const l = (_: IpcRendererEvent, e: { phrase: string; enabled?: boolean }) => cb(e)
    ipcRenderer.on('handshake:phrase', l)
    return () => ipcRenderer.removeListener('handshake:phrase', l)
  },
  profilePreviewShow: () => ipcRenderer.invoke('profile-preview:show') as Promise<{ visible: boolean }>,
  profilePreviewHide: () => ipcRenderer.invoke('profile-preview:hide') as Promise<{ visible: boolean }>,
  profilePreviewLoad: () =>
    ipcRenderer.invoke('profile-preview:load') as Promise<{
      status: 'ok' | 'vault_locked' | 'brain_down' | 'no_knowledge'
      summary?: string
      source?: 'ollama' | 'fallback'
      userMd?: string
    }>,
  onProfilePreviewProgress: (
    cb: (e: { phase: 'user_md' | 'notes' | 'search' | 'summarize' | 'done'; pct: number }) => void,
  ) => {
    const l = (
      _: IpcRendererEvent,
      ev: { phase: 'user_md' | 'notes' | 'search' | 'summarize' | 'done'; pct: number },
    ) => cb(ev)
    ipcRenderer.on('profile-preview:progress', l)
    return () => ipcRenderer.removeListener('profile-preview:progress', l)
  },
  profilePreviewSave: (content: string) =>
    ipcRenderer.invoke('profile-preview:save', content) as Promise<
      | { ok: true; path: string; chars: number }
      | { ok: false; error: 'vault_locked' | 'too_long' | 'write_failed'; detail?: string; maxChars?: number }
    >,
  onAppToast: (
    cb: (t: { kind: 'info' | 'success' | 'warn' | 'error'; title: string; detail?: string }) => void,
  ) => {
    const l = (
      _: IpcRendererEvent,
      t: { kind: 'info' | 'success' | 'warn' | 'error'; title: string; detail?: string },
    ) => cb(t)
    ipcRenderer.on('app:toast', l)
    return () => ipcRenderer.removeListener('app:toast', l)
  },
  onAppNavigate: (cb: (route: string) => void) => {
    const l = (_: IpcRendererEvent, route: string) => cb(route)
    ipcRenderer.on('app:navigate', l)
    return () => ipcRenderer.removeListener('app:navigate', l)
  },
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close')
}

contextBridge.exposeInMainWorld('pomnia', bridge)
