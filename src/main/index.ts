import { basename, join } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import crypto from 'node:crypto'
import { BrowserWindow, app, dialog, globalShortcut, ipcMain, shell, type WebContents } from 'electron'
import {
  Ollama,
  Vault,
  buildIndex,
  buildSnippet,
  checkAllClients,
  createMcpToken,
  currentOS,
  defaultOllamaConfig,
  deployDashboard,
  deployFilesystem,
  deployDistilledToBrain,
  detectAll,
  distillAll,
  exportConversationsToDir,
  getAdapter,
  homeDir,
  hostName,
  isWorthDistilling,
  listAllSkills,
  loadIndex,
  log,
  parseExportPath,
  pingBrain,
  runBackup,
  saveIndex,
  searchIndex,
  setLogSink,
  initFileLog,
  syncSkills,
  triggerReindex,
  userName,
  type BackupOptions,
  type ClientId,
  type Conversation,
  type Snapshot,
  type SourceId,
  localizePipelineProgress,
} from '@core/index'

import { brainCore } from './brainCore.js'
import { startMcpActivityPoll, stopMcpActivityPoll, setMcpActivityWindowFocused } from './mcpActivityPoll.js'
import { DOC_IMPORT_EXTENSIONS, importDocument, isDocImportPath } from './docImport.js'
import { indexPendingLibraryDocuments, type PendingIndexResult } from './libraryIndex.js'
import { getAppSettings, loadAppSettings, setAppSettings, shouldHideOnClose, shouldHideOnMinimize } from './appSettings.js'
import { destroyTray, initTray, refreshTrayMenu } from './tray.js'
import {
  destroyFloatingMonitor,
  getFloatingWebContents,
  hideFloatingMonitor,
  hideFloatingWhenMainShown,
  isFloatingAlwaysOnTop,
  isFloatingMonitorVisible,
  maybeShowFloatingOnHide,
  openMainOnGuide,
  setFloatingAlwaysOnTop,
  setFloatingMainWindow,
  showFloatingMonitor,
  toggleFloatingMonitor,
} from './floatingMonitor.js'
import {
  destroyHandshake,
  hideHandshake,
  isGoArmed,
  setGoArmed,
  setHandshakeMainWindow,
  showHandshake,
  tryArmHandshake,
} from './handshake.js'
import { activity, type ActivityUpdate } from './activity.js'
import {
  getLastActivityReplay,
  initActivityReplayStore,
  loadLastActivityReplay,
} from './activityReplayStore.js'
import { isCursorDbTooLarge } from '@core/adapters/cursor.js'
import { migrateBrainIndexFile, migrateLegacyAppData } from './migrateLegacy.js'
import { ensureBrainForIndexing } from './ensureBrain.js'
import { brainCoreDataDir, brainVaultDistilledDir, brainVaultRoot, brainSkillsDir } from './brainPaths.js'
import { ensurePortableSkills } from './ensurePortableSkills.js'
import { brainProcessFailedMessage, ollamaUnreachableMessage, probeOllama, resolveOllamaUrl } from './ollamaSettings.js'

let win: BrowserWindow | null = null
let forceQuit = false
/** True while awaiting brainCore.stop() during quit — prevents before-quit re-entry. */
let quittingCleanup = false

function requestQuit(): void {
  forceQuit = true
  app.quit()
}

/** `?.` on BrowserWindow does not protect against a destroyed window / webContents. */
function canSendToWindow(w: BrowserWindow | null | undefined): w is BrowserWindow {
  return !!w && !w.isDestroyed() && !w.webContents.isDestroyed()
}

function safeSend(wc: WebContents | null | undefined, channel: string, ...args: unknown[]): void {
  if (!wc || wc.isDestroyed()) return
  try {
    wc.send(channel, ...args)
  } catch {
    // Destroyed mid-send during quit — ignore.
  }
}

function safeSendMain(channel: string, ...args: unknown[]): void {
  if (!canSendToWindow(win)) return
  safeSend(win.webContents, channel, ...args)
}

let vault: Vault | null = null
let vaultPath: string | null = null
let brainRunAbort: AbortController | null = null
let mcpQueryIdleTimer: ReturnType<typeof setTimeout> | null = null

const MCP_QUERY_IDLE_MS = 8_000

function emitMcpQueryActivity(ev: { tool?: string; detail?: string }): void {
  log.info(`mcp-query activity: tool=${ev.tool ?? '?'}${ev.detail ? ` detail=${ev.detail}` : ''}`)
  activity.update({ kind: 'mcp-query', phase: ev.tool, detail: ev.detail ?? ev.tool })
  if (mcpQueryIdleTimer) clearTimeout(mcpQueryIdleTimer)
  mcpQueryIdleTimer = setTimeout(() => {
    activity.idle('mcp-query')
    mcpQueryIdleTimer = null
  }, MCP_QUERY_IDLE_MS)
}

function requireVault(): Vault {
  if (!vault) throw new Error('No vault is open')
  return vault
}

function emitBrainProgress(p: { phase: string; done?: number; total?: number; detail?: string }): void {
  if (p.phase === 'idle') {
    emitBrainProgressClear()
    return
  }
  const kind: ActivityUpdate['kind'] =
    p.phase === 'index' ? 'embed' : p.phase === 'distill' || p.phase === 'collect' || p.phase === 'deploy' ? 'distill' : 'distill'
  activity.update({ kind, phase: p.phase, done: p.done, total: p.total, detail: p.detail })
  const payload = localizePipelineProgress({
    phase: p.phase,
    done: p.done ?? 0,
    total: p.total ?? 0,
    detail: p.detail,
  })
  safeSendMain('brain:progress', payload)
}

function emitBrainProgressClear(): void {
  activity.pipelineIdle()
  safeSendMain('brain:progress', { phase: 'idle', done: 0, total: 0 })
}

function emitDocImportProgress(ev: { phase: string; done: number; total: number; detail?: string }): void {
  const kind: ActivityUpdate['kind'] =
    ev.phase === 'index'
      ? 'indexing'
      : ev.phase === 'brain-start'
        ? 'brain-start'
        : ev.phase === 'encrypt' || ev.phase === 'parse'
          ? 'doc-import'
          : 'doc-import'
  activity.update({ kind, phase: ev.phase, done: ev.done, total: ev.total, detail: ev.detail })
  safeSendMain('doc:import-progress', localizePipelineProgress(ev))
}

const brainDir = (): string => join(app.getPath('userData'), 'brain-notes')
const brainIndexFile = (): string => join(brainDir(), '.pomnia-index.json')

/* ── Distill ledger ────────────────────────────────────────────────────────
   Which conversation ids have been through the pipeline. This is what lets
   the UI show an honest backlog ("N chats not distilled yet") instead of
   guessing — and lets "distill backlog" run incrementally. */
const ledgerFile = (): string => join(app.getPath('userData'), 'distill-ledger.json')

interface DistillLedger {
  /** conversation id → ISO timestamp of the run that processed it */
  processed: Record<string, string>
}

async function readLedger(): Promise<DistillLedger> {
  try {
    return JSON.parse(await fs.readFile(ledgerFile(), 'utf8')) as DistillLedger
  } catch {
    return { processed: {} }
  }
}

async function markProcessed(ids: string[]): Promise<void> {
  const l = await readLedger()
  const now = new Date().toISOString()
  for (const id of ids) if (!l.processed[id]) l.processed[id] = now
  await fs.writeFile(ledgerFile(), JSON.stringify(l), 'utf8')
}

function ollamaFor(url?: string, model?: string): Ollama {
  const cfg = defaultOllamaConfig()
  cfg.baseUrl = resolveOllamaUrl(url)
  if (model) cfg.chatModel = model
  return new Ollama(cfg)
}

async function notifyLibraryIndexComplete(flush: PendingIndexResult): Promise<void> {
  if (flush.indexed <= 0 && flush.errors.length === 0) return
  safeSendMain('library:index-complete', flush)
  if (flush.indexed > 0) {
    log.info(`library index flush: ${flush.indexed} doc(s), ${flush.chunks} chunk(s)`)
  }
  for (const err of flush.errors) log.warn('library index:', err)
}

/** Index vault docs marked pendingIndex when embedded brain is already running. */
async function flushPendingLibraryDocs(ollamaUrl?: string): Promise<PendingIndexResult | null> {
  if (!vault || !vaultPath || !brainCore.status().running) return null
  if (vault.getPendingIndexDocuments().length === 0) return null
  const url = resolveOllamaUrl(ollamaUrl)
  activity.update({ kind: 'indexing', phase: 'index', detail: 'oczekujące dokumenty…' })
  try {
    const flush = await indexPendingLibraryDocuments(vault, vaultPath, {
      ollamaUrl: url,
      skipEnsure: true,
      onProgress: emitDocImportProgress,
    })
    await notifyLibraryIndexComplete(flush)
    return flush
  } finally {
    activity.idle(['indexing', 'doc-import'])
  }
}

async function maybeAutoStartEmbeddedBrain(ollamaUrl?: string): Promise<void> {
  const url = resolveOllamaUrl(ollamaUrl)
  if (brainCore.status().running) {
    await flushPendingLibraryDocs(url)
    return
  }
  if (brainCore.status().starting) return
  if (!getAppSettings().embeddedBrainAutoStart) return
  const ensured = await ensureBrainForIndexing(url, undefined, vaultPath)
  if (!ensured.running || !vault || !vaultPath) return
  refreshTrayMenu(win, requestQuit)
  await flushPendingLibraryDocs(url)
}

async function collectLive(sources: SourceId[], limit?: number): Promise<Conversation[]> {
  const os = currentOS()
  const home = homeDir()
  const out: Conversation[] = []
  for (const id of sources) {
    const a = getAdapter(id)
    if (!a?.collectConversations) continue
    const root = a.resolveRoot(os, home)
    if (root) out.push(...(await a.collectConversations(root)))
  }
  return limit && limit > 0 ? out.slice(0, limit) : out
}


/** Window / taskbar icon — same candidates as tray.ts */
function resolveWindowIcon(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
    join(app.getAppPath(), 'resources', 'icon.ico'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: resolveWindowIcon(),
    backgroundColor: '#060a08',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      // electron-vite emits the preload as ESM (index.mjs) — must match exactly,
      // otherwise the bridge never loads and the renderer falls back to its mock.
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('focus', () => setMcpActivityWindowFocused(true))
  win.on('blur', () => setMcpActivityWindowFocused(false))
  win.on('show', () => hideFloatingWhenMainShown())
  win.on('minimize', () => maybeShowFloatingOnHide(!!vault))
  win.on('hide', () => maybeShowFloatingOnHide(!!vault))
  win.on('close', (e) => {
    if (forceQuit || !shouldHideOnClose(brainCore.status().running)) return
    e.preventDefault()
    win?.hide()
    maybeShowFloatingOnHide(!!vault)
  })
  // Pipe renderer console output (incl. uncaught exceptions logged via
  // window.onerror in App.tsx) into the main-process log — otherwise
  // renderer-side errors are invisible outside DevTools.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log.warn(`[renderer] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-finish-load', () => {
    win?.webContents
      .executeJavaScript('typeof window.pomnia')
      .then((t) => {
        const bridge = t === 'object' ? 'connected' : `MISSING(${t})`
        log.info('renderer bridge:', bridge)
        // Diagnostic marker (survives GUI stdout being swallowed on Windows).
        fs.writeFile(
          join(app.getPath('userData'), 'launch-check.json'),
          JSON.stringify({ ts: new Date().toISOString(), bridge, version: app.getVersion() }, null, 2)
        ).catch(() => {})
      })
      .catch(() => {})
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  setLogSink((level, msg) => safeSendMain('log', { level, msg }))

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))

  setFloatingMainWindow(win)
  setHandshakeMainWindow(win)
}

/* ── IPC ───────────────────────────────────────────────────────────────── */
function registerIpc(): void {
  activity.wire(
    (channel, payload) => {
      const send = (wc: WebContents) => {
        if (channel === 'activity:update') safeSend(wc, 'activity:update', payload)
        else safeSend(wc, 'activity:idle')
      }
      if (canSendToWindow(win)) send(win.webContents)
      const floating = getFloatingWebContents()
      if (floating && !floating.isDestroyed()) send(floating)
    },
    () => refreshTrayMenu(win, requestQuit),
  )
  ipcMain.handle('activity:get', () => activity.get())
  ipcMain.handle('activity:lastReplay', () => getLastActivityReplay())
  ipcMain.handle('mcpActivity:watch', (_e, active: boolean) => {
    if (active) startMcpActivityPoll(emitMcpQueryActivity)
    else stopMcpActivityPoll()
    return { ok: true }
  })

  ipcMain.handle('scan', () => detectAll())

  ipcMain.handle('vault:status', () => ({
    open: !!vault,
    path: vaultPath ?? undefined,
    name: vault?.getManifest().name,
    snapshots: vault?.getManifest().snapshots.length ?? 0,
    pendingLibraryIndex: vault?.getPendingIndexDocuments().length ?? 0,
  }))

  ipcMain.handle('vault:pickDir', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Select vault folder',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('pick:file', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Select export archive',
      properties: ['openFile'],
      filters: [{ name: 'Exports', extensions: ['zip', 'json', 'jsonl', 'md', 'txt'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('pick:docFile', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Select document',
      properties: ['openFile'],
      filters: [{ name: 'Documents', extensions: DOC_IMPORT_EXTENSIONS }]
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('doc:import', async (_e, filePath?: string, ollamaUrl?: string) => {
    const v = requireVault()
    const url = resolveOllamaUrl(ollamaUrl)
    const p =
      filePath ??
      (
        await dialog.showOpenDialog(win!, {
          title: 'Import document',
          properties: ['openFile'],
          filters: [{ name: 'Documents', extensions: DOC_IMPORT_EXTENSIONS }]
        })
      ).filePaths[0]
    if (!p) return null
    if (!isDocImportPath(p)) {
      throw new Error(`Unsupported document format: ${p}`)
    }
    try {
      return await importDocument(v, vaultPath!, p, emitDocImportProgress, url)
    } finally {
      activity.idle(['doc-import', 'indexing', 'brain-start'])
    }
  })

  ipcMain.handle('vault:create', async (_e, path: string, name: string, pass: string) => {
    vault = await Vault.create(path, name, pass)
    vaultPath = path
    const skillsRoot = await ensurePortableSkills(path)
    brainCore.setSkillsRoot(skillsRoot)
    void maybeAutoStartEmbeddedBrain()
    return { open: true, path, name, snapshots: 0, pendingLibraryIndex: 0 }
  })

  ipcMain.handle('vault:open', async (_e, path: string, pass: string) => {
    vault = await Vault.open(path, pass)
    vaultPath = path
    const skillsRoot = await ensurePortableSkills(path)
    brainCore.setSkillsRoot(skillsRoot)
    const m = vault.getManifest()
    const pendingLibraryIndex = vault.getPendingIndexDocuments().length
    void maybeAutoStartEmbeddedBrain()
    return { open: true, path, name: m.name, snapshots: m.snapshots.length, pendingLibraryIndex }
  })

  ipcMain.handle('vault:lock', () => {
    vault = null
    vaultPath = null
  })

  ipcMain.handle('snapshots:list', () => requireVault().getManifest().snapshots)

  ipcMain.handle('backup', async (_e, sources: SourceId[], note?: string) => {
    const opts: BackupOptions = { sources, note }
    return runBackup(requireVault(), opts, (p) => safeSendMain('backup:progress', p))
  })

  ipcMain.handle('verify', () => requireVault().verify())

  ipcMain.handle('conversations', async (_e, id: string) => (await requireVault().getSnapshotPayload(id)).conversations)

  // Aggregate conversations across every snapshot (dedup by id, newest wins). No GPU.
  ipcMain.handle('vault:conversations', async () => {
    const v = requireVault()
    const seen = new Map<string, { id: string; source: string; title: string; messages: number; updatedAt?: string; project?: string; snapshotId: string }>()
    for (const s of v.getManifest().snapshots) {
      const p = await v.getSnapshotPayload(s.id).catch(() => null)
      if (!p) continue
      for (const c of p.conversations) {
        const meta = { id: c.id, source: c.source, title: c.title, messages: c.messages.length, updatedAt: c.updatedAt || c.createdAt, project: c.project, snapshotId: s.id }
        const prev = seen.get(c.id)
        if (!prev || (meta.updatedAt || '') > (prev.updatedAt || '')) seen.set(c.id, meta)
      }
    }
    return [...seen.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  })

  ipcMain.handle('vault:conversation', async (_e, snapshotId: string, id: string) => {
    const p = await requireVault().getSnapshotPayload(snapshotId)
    return p.conversations.find((c) => c.id === id) ?? null
  })

  // Plain substring full-text search across all captured conversations. No GPU.
  ipcMain.handle('vault:searchText', async (_e, query: string) => {
    const v = requireVault()
    const q = query.toLowerCase().trim()
    if (!q) return []
    const hits: { snapshotId: string; id: string; source: string; title: string; snippet: string; matches: number }[] = []
    const seen = new Set<string>()
    for (const s of v.getManifest().snapshots) {
      const p = await v.getSnapshotPayload(s.id).catch(() => null)
      if (!p) continue
      for (const c of p.conversations) {
        if (seen.has(c.id)) continue
        let matches = 0
        let snippet = ''
        for (const m of c.messages) {
          const idx = m.text.toLowerCase().indexOf(q)
          if (idx >= 0) {
            matches++
            if (!snippet) snippet = m.text.slice(Math.max(0, idx - 40), idx + 90).replace(/\s+/g, ' ')
          }
        }
        if (matches || c.title.toLowerCase().includes(q)) {
          seen.add(c.id)
          hits.push({ snapshotId: s.id, id: c.id, source: c.source, title: c.title, snippet: snippet || c.title, matches })
        }
      }
    }
    return hits.sort((a, b) => b.matches - a.matches).slice(0, 60)
  })

  ipcMain.handle('brain:export', async (_e, id: string, outDir: string) => {
    const { conversations } = await requireVault().getSnapshotPayload(id)
    const files = await exportConversationsToDir(conversations, outDir)
    return { count: files.length, dir: outDir }
  })

  // Import an export archive (Claude.ai/ChatGPT/Gemini/Grok/…) → seal its
  // conversations into the open vault as snapshot(s), one per detected source.
  ipcMain.handle('import:toVault', async (_e, p: string) => {
    const v = requireVault()
    const { conversations } = await parseExportPath(p)
    if (!conversations.length) return { sealed: 0, sources: [] as { source: string; count: number }[] }
    const labels: Record<string, string> = {
      'claude-ai': 'Claude.ai',
      chatgpt: 'ChatGPT',
      grok: 'Grok',
      gemini: 'Gemini',
      generic: 'Imported'
    }
    const groups = new Map<string, Conversation[]>()
    for (const c of conversations) {
      const arr = groups.get(c.source) ?? []
      arr.push(c)
      groups.set(c.source, arr)
    }
    const origin = { host: hostName(), user: userName(), home: homeDir() }
    const sources: { source: string; count: number }[] = []
    for (const [src, convs] of groups) {
      const meta: Snapshot = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source: { id: src as SourceId, label: labels[src] ?? src, strategy: 'structured', root: p, os: currentOS() },
        note: `imported from ${basename(p)}`,
        origin,
        stats: { conversations: 0, messages: 0, files: 0, bytes: 0 }
      }
      await v.addSnapshot(meta, convs, [])
      sources.push({ source: src, count: convs.length })
    }
    return { sealed: conversations.length, sources }
  })

  ipcMain.handle('reveal', (_e, p: string) => shell.openPath(p))

  // ── Brain pipeline (host-side distill + pre-index → deploy) ──
  ipcMain.handle('brain:status', async (_e, url?: string) => {
    const o = ollamaFor(url)
    const reachable = await o.reachable()
    const models = reachable ? (await o.listModels()).map((m) => m.name) : []
    return { reachable, baseUrl: o.cfg.baseUrl, chatModel: o.cfg.chatModel, embedModel: o.cfg.embedModel, models }
  })

  // One pull at a time — Ollama serializes downloads anyway, and a single
  // AbortController keeps cancel semantics trivial.
  let pullAbort: AbortController | null = null
  ipcMain.handle('ollama:pull', async (_e, model: string, url?: string) => {
    if (pullAbort) throw new Error('another pull is already running')
    const o = ollamaFor(url)
    pullAbort = new AbortController()
    try {
      await o.pull(
        model,
        (p) => safeSendMain('ollama:pull:progress', { model, ...p }),
        pullAbort.signal
      )
      safeSendMain('ollama:pull:progress', { model, status: 'success' })
      return { ok: true }
    } finally {
      pullAbort = null
    }
  })
  ipcMain.handle('ollama:pullCancel', () => {
    pullAbort?.abort()
    return { ok: true }
  })

  ipcMain.handle(
    'brain:run',
    async (
      _e,
      opts: {
        sources: SourceId[]
        limit?: number
        model?: string
        ollamaUrl?: string
        importPath?: string
        pendingOnly?: boolean
        /** After distill, push notes to remote Brain (KVM/homelab) and reindex. */
        autoDeploy?: boolean
        deployUrl?: string
        /** Optional SMB/NFS path to brain vault/distilled (preferred over HTTP). */
        deployTarget?: string
        reindex?: boolean
        /** Bearer token for remote Brain dashboard API (reindex). */
        deployToken?: string
      }
    ) => {
      brainRunAbort?.abort()
      brainRunAbort = new AbortController()
      const signal = brainRunAbort.signal
      let triggerFinale = false
      try {
        const o = ollamaFor(opts.ollamaUrl, opts.model)
        if (!(await o.reachable())) throw new Error(`Ollama offline at ${o.cfg.baseUrl}`)
        let convs = opts.importPath
          ? (await parseExportPath(opts.importPath)).conversations.slice(0, opts.limit || undefined)
          : await collectLive(opts.sources, opts.limit)
        if (opts.pendingOnly) {
          const l = await readLedger()
          convs = convs.filter((c) => !l.processed[c.id])
        }
        if (convs.length === 0) {
          return {
            notesDir: brainDir(),
            notes: 0,
            stubs: 0,
            garbage: 0,
            skipped: 0,
            failed: 0,
            chunks: 0,
            dim: 0,
            deployed: 0,
            deployMethod: 'none' as const,
            reindexed: false,
            emptyBacklog: true,
          }
        }
        activity.update({ kind: 'distill', phase: 'distill', done: 0, total: convs.length })
        const { notes, skipped, failed } = await distillAll(
          convs,
          o,
          opts.model,
          emitBrainProgress,
          { signal }
        )
        if (signal.aborted) throw new Error('Distill cancelled')
        const dir = brainDir()
        // Staging copy for UI / legacy local index (userData/brain-notes).
        await deployFilesystem(notes, dir)
        // Canonical vault for embedded MCP (brain-core-data/vault/distilled).
        const vaultDistilled = brainVaultDistilledDir()
        await deployFilesystem(notes, vaultDistilled)
        const okNotes = notes.filter((n) => n.quality === 'ok')
        const idx = await buildIndex(
          okNotes.map((n) => ({ source: n.source, notePath: n.sessionId, text: n.markdown })),
          o,
          (done, total) => emitBrainProgress({ phase: 'index', done, total })
        )
        await saveIndex(idx, brainIndexFile())
        // Only quality:ok locks the ledger. Stub/garbage stay pending so the
        // next "distill backlog" retries them instead of stranding knowledge in _review/.
        const okIds = new Set(notes.filter((n) => n.quality === 'ok').map((n) => n.sessionId))
        const processedIds = convs
          .filter((c) => !isWorthDistilling(c) || okIds.has(c.id))
          .map((c) => c.id)
        await markProcessed(processedIds)

        // Local vault deploy is always done above; report it so embedded UX matches remote.
        let deployed = okNotes.length
        let deployMethod: 'filesystem' | 'http' | 'none' = okNotes.length > 0 ? 'filesystem' : 'none'
        let reindexed = false

        // Reindex vault root (distilled + sessions) — not brain-notes staging.
        if (brainCore.status().running && opts.reindex !== false) {
          activity.update({ kind: 'indexing', phase: 'reindex', done: 0, total: 1, detail: 'po destylacji…' })
          try {
            await brainCore.reindex(brainVaultRoot())
            reindexed = true
          } catch (e) {
            log.warn('embedded reindex failed:', (e as Error).message)
          }
        }

        if (opts.autoDeploy && opts.deployUrl && okNotes.length > 0) {
          emitBrainProgress({
            phase: 'deploy',
            done: 0,
            total: 1,
            detail: 'pushing notes to remote Brain…'
          })
          const dep = await deployDistilledToBrain({
            notesDir: dir,
            dashboardUrl: opts.deployUrl,
            filesystemTarget: opts.deployTarget,
            reindex: opts.reindex !== false,
            token: opts.deployToken
          })
          // Remote attempt owns the deploy stats (incl. method=none → UI warns).
          deployed = dep.copied
          deployMethod = dep.method
          reindexed = dep.reindex || reindexed
          emitBrainProgress({
            phase: 'deploy',
            done: 1,
            total: 1,
            detail: dep.method === 'none'
              ? 'deploy skipped — set deploy folder or enable save-note API on Brain'
              : `${dep.copied} note(s) via ${dep.method}${dep.reindex ? ' · reindex ok' : ' · reindex failed'}`
          })
        }

        triggerFinale = true
        return {
          notesDir: dir,
          notes: okNotes.length,
          stubs: notes.filter((n) => n.quality === 'stub').length,
          garbage: notes.filter((n) => n.quality === 'garbage').length,
          skipped,
          failed: failed.length,
          chunks: idx.entries.length,
          dim: idx.dim,
          deployed,
          deployMethod,
          reindexed
        }
      } finally {
        brainRunAbort = null
        if (triggerFinale) activity.pipelineFinale()
        else emitBrainProgressClear()
      }
    }
  )

  ipcMain.handle('brain:runCancel', () => {
    brainRunAbort?.abort()
    return { ok: true }
  })

  // ── Embedded brain-core (fork lifecycle) ──
  brainCore.onEvent = (e) => {
    safeSendMain('brainCore:event', e)
    if (e.type === 'reindex-progress' || e.type === 'index-progress') {
      activity.update({
        kind: 'indexing',
        phase: e.type === 'reindex-progress' ? 'reindex' : 'index',
        done: e.done,
        total: e.total,
        detail: e.file,
      })
    }
    if (e.type === 'mcp-query') {
      emitMcpQueryActivity({ tool: e.tool, detail: e.detail })
    }
    if (e.type === 'ready' || e.type === 'exited') {
      activity.idle(['brain-start', 'indexing', 'doc-import'])
      refreshTrayMenu(win, requestQuit)
    }
  }
  ipcMain.handle('brainCore:status', () => brainCore.status())
  ipcMain.handle('brainCore:start', async (_e, ollamaUrl?: string) => {
    const url = resolveOllamaUrl(ollamaUrl)
    activity.update({ kind: 'brain-start', phase: 'start', detail: 'sprawdzam Ollama…' })
    const probe = await probeOllama(url)
    if (!probe.ok) throw new Error(ollamaUnreachableMessage(probe))
    activity.update({ kind: 'brain-start', phase: 'start', detail: 'uruchamiam…' })
    try {
      await brainCore.start({
        dataDir: brainCoreDataDir(),
        ollamaUrl: url,
        skillsRoot: brainSkillsDir(vaultPath),
      })
      await setAppSettings({ embeddedBrainAutoStart: true, ollamaUrl: url })
      await flushPendingLibraryDocs(url)
      refreshTrayMenu(win, requestQuit)
      return brainCore.status()
    } catch (err) {
      throw new Error(brainProcessFailedMessage(err))
    } finally {
      activity.idle(['brain-start', 'doc-import', 'indexing'])
    }
  })
  ipcMain.handle('brainCore:stop', async () => {
    activity.idle(['indexing', 'brain-start', 'doc-import'])
    const s = await brainCore.stop()
    await setAppSettings({ embeddedBrainAutoStart: false })
    refreshTrayMenu(win, requestQuit)
    return s
  })
  ipcMain.handle('brainCore:reindex', async () => {
    activity.update({ kind: 'indexing', phase: 'reindex' })
    try {
      const stats = await brainCore.reindex(brainVaultRoot())
      return { stats }
    } finally {
      activity.idle('indexing')
    }
  })
  ipcMain.handle('app:settings', () => getAppSettings())
  ipcMain.handle('app:version', () => ({ version: app.getVersion() }))
  ipcMain.handle('app:openLogs', async () => {
    const dir = join(app.getPath('userData'), 'logs')
    await fs.mkdir(dir, { recursive: true })
    await shell.openPath(dir)
    return dir
  })
  ipcMain.handle(
    'app:settings:set',
    async (
      _e,
      patch: {
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
      },
    ) => setAppSettings(patch),
  )

  ipcMain.handle('floating-monitor:show', async () => {
    await showFloatingMonitor({ force: true })
    return { visible: isFloatingMonitorVisible() }
  })
  ipcMain.handle('floating-monitor:hide', () => {
    hideFloatingMonitor()
    return { visible: false }
  })
  ipcMain.handle('floating-monitor:toggle', async () => {
    const visible = await toggleFloatingMonitor()
    refreshTrayMenu(win, requestQuit)
    return { visible }
  })
  ipcMain.handle('floating-monitor:open-main', () => {
    openMainOnGuide()
    return { ok: true }
  })
  ipcMain.handle('floating-monitor:is-visible', () => ({ visible: isFloatingMonitorVisible() }))
  ipcMain.handle('floating-monitor:get-always-on-top', () => ({
    alwaysOnTop: isFloatingAlwaysOnTop(),
  }))
  ipcMain.handle('floating-monitor:set-always-on-top', async (_e, on: boolean) => {
    const alwaysOnTop = await setFloatingAlwaysOnTop(!!on)
    return { alwaysOnTop }
  })

  ipcMain.handle('handshake:show', async () => {
    await showHandshake()
    refreshTrayMenu(win, requestQuit)
    return { visible: true }
  })
  ipcMain.handle('handshake:hide', () => {
    hideHandshake()
    refreshTrayMenu(win, requestQuit)
    return { visible: false }
  })
  ipcMain.handle('handshake:try', (_e, phrase: string) => {
    const result = tryArmHandshake(String(phrase ?? ''))
    if (result.ok) {
      safeSendMain('handshake:toast-ready')
      refreshTrayMenu(win, requestQuit)
    }
    return result
  })
  ipcMain.handle('handshake:get-armed', () => ({ armed: isGoArmed() }))
  ipcMain.handle('handshake:disarm', () => ({ armed: setGoArmed(false) }))

  app.on('before-quit', (e) => {
    if (quittingCleanup) return
    e.preventDefault()
    quittingCleanup = true
    forceQuit = true
    // Detach before stop — child exit still fires onEvent with type 'exited'.
    brainCore.onEvent = null
    destroyFloatingMonitor()
    destroyHandshake()
    destroyTray()
    void brainCore
      .stop()
      .catch((err) => log.warn('brainCore stop on quit:', (err as Error).message))
      .finally(() => {
        app.quit()
      })
  })

  // Honest pipeline state: how many chats exist in the tools right now vs how
  // many the ledger has seen. Reads live sources, so it reflects deletions too.
  ipcMain.handle('brain:state', async () => {
    const os = currentOS()
    const home = homeDir()
    const l = await readLedger()
    const perSource: { source: SourceId; label: string; total: number; pending: number }[] = []
    for (const s of await detectAll()) {
      const a = getAdapter(s.id)
      if (!s.installed || !a?.collectConversations) continue
      const root = a.resolveRoot(os, home)
      if (!root) continue
      if (s.id === 'cursor' && (await isCursorDbTooLarge(root))) {
        const total = s.conversations ?? 0
        perSource.push({ source: s.id, label: s.label, total, pending: total })
        continue
      }
      const convs = await a.collectConversations(root)
      const pending = convs.filter((c) => !l.processed[c.id]).length
      perSource.push({ source: s.id, label: s.label, total: convs.length, pending })
    }
    const total = perSource.reduce((n, p) => n + p.total, 0)
    const pending = perSource.reduce((n, p) => n + p.pending, 0)
    const stamps = Object.values(l.processed).sort()
    return { total, distilled: total - pending, pending, perSource, lastRun: stamps.at(-1) ?? null }
  })

  ipcMain.handle('brain:search', async (_e, query: string, url?: string) => {
    const idx = await loadIndex(brainIndexFile())
    return searchIndex(idx, query, ollamaFor(url), 8)
  })

  ipcMain.handle(
    'brain:deploy',
    async (
      _e,
      opts: { to: 'filesystem' | 'dashboard'; target?: string; url?: string; reindex?: boolean; token?: string; sources?: SourceId[] }
    ) => {
      let detail = ''
      if (opts.to === 'filesystem') {
        if (!opts.target) throw new Error('target dir required')
        await fs.mkdir(opts.target, { recursive: true })
        const files = (await fs.readdir(brainDir())).filter((f) => f.endsWith('.md'))
        for (const f of files) await fs.copyFile(join(brainDir(), f), join(opts.target, f))
        // Keep embedded vault in sync when manually deploying.
        const vaultDistilled = brainVaultDistilledDir()
        await fs.mkdir(vaultDistilled, { recursive: true })
        for (const f of files) await fs.copyFile(join(brainDir(), f), join(vaultDistilled, f))
        detail = `Copied ${files.length} notes → ${opts.target} (+ vault/distilled)`
        if (opts.reindex !== false && brainCore.status().running) {
          try {
            await brainCore.reindex(brainVaultRoot())
            detail += ' · embedded reindex ok'
          } catch (e) {
            detail += ` · embedded reindex failed: ${(e as Error).message}`
          }
        }
      } else {
        const convs = await collectLive(opts.sources ?? [])
        const r = await deployDashboard(convs, opts.url || 'http://localhost:7860')
        detail = `Pushed to Brain: ${r.ok} ok, ${r.failed} failed`
      }
      if (opts.reindex && opts.url) {
        const ok = await triggerReindex(opts.url, opts.token)
        detail += ok ? ' · reindex triggered' : ' · reindex failed'
      }
      return { detail }
    }
  )

  // ── Connect to Brain (status read + copy-paste snippets, no auto-deploy) ──
  ipcMain.handle('connect:status', async (_e, brainUrl?: string, token?: string, target?: 'embedded' | 'remote') => {
    const saved = getAppSettings()
    const url =
      brainUrl?.trim() ||
      (target === 'embedded'
        ? 'http://127.0.0.1:7862'
        : saved.brainMcpUrl?.trim() || '')
    if (!url) {
      const [clients] = await Promise.all([checkAllClients()])
      return {
        clients,
        brain: { url: '', reachable: false, error: 'Brak skonfigurowanego URL serwera Brain' },
      }
    }
    const [clients, brain] = await Promise.all([
      checkAllClients(),
      pingBrain(url, target === 'embedded' ? undefined : token),
    ])
    return { clients, brain }
  })

  ipcMain.handle(
    'connect:snippet',
    (_e, clientId: ClientId, brainUrl: string, token?: string, target?: 'embedded' | 'remote') =>
      buildSnippet(clientId, brainUrl, currentOS(), homeDir(), token, target ?? 'remote'),
  )

  ipcMain.handle('connect:skillsList', (_e, brainUrl: string, token?: string) =>
    listAllSkills(brainUrl, { token })
  )

  ipcMain.handle('connect:skillsSync', (_e, brainUrl: string, token?: string) =>
    syncSkills(brainUrl, brainSkillsDir(vaultPath), { token })
  )

  ipcMain.handle(
    'connect:mcpTokenCreate',
    (_e, brainUrl: string, name: string, adminToken?: string) =>
      createMcpToken(brainUrl, name, { token: adminToken }),
  )

  ipcMain.on('win:minimize', () => {
    if (shouldHideOnMinimize()) {
      win?.hide()
      maybeShowFloatingOnHide(!!vault)
    } else {
      win?.minimize()
      maybeShowFloatingOnHide(!!vault)
    }
  })
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
}

app.whenReady().then(async () => {
  await migrateLegacyAppData()
  initFileLog(join(app.getPath('userData'), 'logs'))
  log.info('Pomnia starting', app.getVersion())
  await fs.mkdir(brainDir(), { recursive: true })
  await migrateBrainIndexFile(brainDir())
  await loadAppSettings()
  initActivityReplayStore(app.getPath('userData'))
  await loadLastActivityReplay()
  registerIpc()
  createWindow()
  if (win) void initTray(win, requestQuit)
  // Personal ritual window — Ctrl+Shift+H (optional, discoverable via tray / Brain).
  const hk = globalShortcut.register('CommandOrControl+Shift+H', () => {
    void showHandshake()
  })
  if (!hk) log.warn('handshake hotkey Ctrl+Shift+H not registered (conflict?)')
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else win?.show()
  })
})

app.on('window-all-closed', () => {
  if (forceQuit || process.platform === 'darwin') return
  // Hidden-to-tray keeps the window alive; only quit when explicitly requested.
  if (win && !win.isDestroyed() && !win.isVisible()) return
  app.quit()
})
