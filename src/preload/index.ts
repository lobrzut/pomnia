import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const bridge = {
  platform: process.platform,
  scan: () => ipcRenderer.invoke('scan'),
  vaultStatus: () => ipcRenderer.invoke('vault:status'),
  pickDirectory: () => ipcRenderer.invoke('vault:pickDir'),
  pickFile: () => ipcRenderer.invoke('pick:file'),
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
  brainExport: (id: string, outDir: string) => ipcRenderer.invoke('brain:export', id, outDir),
  revealPath: (p: string) => ipcRenderer.invoke('reveal', p),
  brainStatus: (ollamaUrl?: string) => ipcRenderer.invoke('brain:status', ollamaUrl),
  brainRun: (opts: unknown) => ipcRenderer.invoke('brain:run', opts),
  onBrainProgress: (cb: (e: unknown) => void) => {
    const l = (_: IpcRendererEvent, e: unknown) => cb(e)
    ipcRenderer.on('brain:progress', l)
    return () => ipcRenderer.removeListener('brain:progress', l)
  },
  brainSearch: (query: string, ollamaUrl?: string) => ipcRenderer.invoke('brain:search', query, ollamaUrl),
  brainDeploy: (opts: unknown) => ipcRenderer.invoke('brain:deploy', opts),
  connectStatus: (brainUrl?: string, token?: string) => ipcRenderer.invoke('connect:status', brainUrl, token),
  connectSnippet: (clientId: string, brainUrl: string, token?: string) =>
    ipcRenderer.invoke('connect:snippet', clientId, brainUrl, token),
  connectSkillsList: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsList', brainUrl, token),
  connectSkillsSync: (brainUrl: string, token?: string) => ipcRenderer.invoke('connect:skillsSync', brainUrl, token),
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close')
}

contextBridge.exposeInMainWorld('reliqua', bridge)
