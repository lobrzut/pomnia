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
  docImport: (p?: string, ollamaUrl?: string) => ipcRenderer.invoke('doc:import', p, ollamaUrl),
  brainExport: (id: string, outDir: string) => ipcRenderer.invoke('brain:export', id, outDir),
  revealPath: (p: string) => ipcRenderer.invoke('reveal', p),
  brainStatus: (ollamaUrl?: string) => ipcRenderer.invoke('brain:status', ollamaUrl),
  brainRun: (opts: unknown) => ipcRenderer.invoke('brain:run', opts),
  brainRunCancel: () => ipcRenderer.invoke('brain:runCancel'),
  brainState: () => ipcRenderer.invoke('brain:state'),
  brainCoreStatus: () => ipcRenderer.invoke('brainCore:status'),
  brainCoreStart: (ollamaUrl?: string) => ipcRenderer.invoke('brainCore:start', ollamaUrl),
  brainCoreStop: () => ipcRenderer.invoke('brainCore:stop'),
  brainCoreReindex: () => ipcRenderer.invoke('brainCore:reindex'),
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
  connectStatus: (brainUrl?: string, token?: string, target?: string) =>
    ipcRenderer.invoke('connect:status', brainUrl, token, target),
  connectSnippet: (clientId: string, brainUrl: string, token?: string, target?: string) =>
    ipcRenderer.invoke('connect:snippet', clientId, brainUrl, token, target),
  connectSkillsList: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsList', brainUrl, token),
  connectSkillsSync: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsSync', brainUrl, token),
  connectMcpTokenCreate: (brainUrl: string, name: string, adminToken?: string) =>
    ipcRenderer.invoke('connect:mcpTokenCreate', brainUrl, name, adminToken),
  appSettings: () => ipcRenderer.invoke('app:settings'),
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
  }) => ipcRenderer.invoke('app:settings:set', patch),
  openLogs: () => ipcRenderer.invoke('app:openLogs') as Promise<string>,
  floatingMonitorShow: () => ipcRenderer.invoke('floating-monitor:show') as Promise<{ visible: boolean }>,
  floatingMonitorHide: () => ipcRenderer.invoke('floating-monitor:hide') as Promise<{ visible: boolean }>,
  floatingMonitorToggle: () => ipcRenderer.invoke('floating-monitor:toggle') as Promise<{ visible: boolean }>,
  floatingMonitorOpenMain: () => ipcRenderer.invoke('floating-monitor:open-main') as Promise<{ ok: boolean }>,
  floatingMonitorIsVisible: () => ipcRenderer.invoke('floating-monitor:is-visible') as Promise<{ visible: boolean }>,
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
