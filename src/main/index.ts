import { basename, join } from 'node:path'
import { promises as fs } from 'node:fs'
import crypto from 'node:crypto'
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
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
  syncSkills,
  triggerReindex,
  userName,
  type BackupOptions,
  type ClientId,
  type Conversation,
  type Snapshot,
  type SourceId
} from '@core/index'

import { brainCore } from './brainCore.js'
import { isCursorDbTooLarge } from '@core/adapters/cursor.js'

let win: BrowserWindow | null = null
let vault: Vault | null = null
let vaultPath: string | null = null
let brainRunAbort: AbortController | null = null

function requireVault(): Vault {
  if (!vault) throw new Error('No vault is open')
  return vault
}

const brainDir = (): string => join(app.getPath('userData'), 'brain-notes')
const brainIndexFile = (): string => join(brainDir(), '.reliqua-index.json')

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
  if (url) cfg.baseUrl = url
  if (model) cfg.chatModel = model
  return new Ollama(cfg)
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

function createWindow(): void {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#06070d',
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
  // Pipe renderer console output (incl. uncaught exceptions logged via
  // window.onerror in App.tsx) into the main-process log — otherwise
  // renderer-side errors are invisible outside DevTools.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) log.warn(`[renderer] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('did-finish-load', () => {
    win?.webContents
      .executeJavaScript('typeof window.reliqua')
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

  setLogSink((level, msg) => win?.webContents.send('log', { level, msg }))

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

/* ── IPC ───────────────────────────────────────────────────────────────── */
function registerIpc(): void {
  ipcMain.handle('scan', () => detectAll())

  ipcMain.handle('vault:status', () => ({
    open: !!vault,
    path: vaultPath ?? undefined,
    name: vault?.getManifest().name,
    snapshots: vault?.getManifest().snapshots.length ?? 0
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

  ipcMain.handle('vault:create', async (_e, path: string, name: string, pass: string) => {
    vault = await Vault.create(path, name, pass)
    vaultPath = path
    return { open: true, path, name, snapshots: 0 }
  })

  ipcMain.handle('vault:open', async (_e, path: string, pass: string) => {
    vault = await Vault.open(path, pass)
    vaultPath = path
    const m = vault.getManifest()
    return { open: true, path, name: m.name, snapshots: m.snapshots.length }
  })

  ipcMain.handle('vault:lock', () => {
    vault = null
    vaultPath = null
  })

  ipcMain.handle('snapshots:list', () => requireVault().getManifest().snapshots)

  ipcMain.handle('backup', async (_e, sources: SourceId[], note?: string) => {
    const opts: BackupOptions = { sources, note }
    return runBackup(requireVault(), opts, (p) => win?.webContents.send('backup:progress', p))
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
        (p) => win?.webContents.send('ollama:pull:progress', { model, ...p }),
        pullAbort.signal
      )
      win?.webContents.send('ollama:pull:progress', { model, status: 'success' })
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
      }
    ) => {
      brainRunAbort?.abort()
      brainRunAbort = new AbortController()
      const signal = brainRunAbort.signal
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
        const { notes, skipped, failed } = await distillAll(
          convs,
          o,
          opts.model,
          (p) => win?.webContents.send('brain:progress', p),
          { signal }
        )
        if (signal.aborted) throw new Error('Distill cancelled')
        const dir = brainDir()
        await deployFilesystem(notes, dir)
        const okNotes = notes.filter((n) => n.quality === 'ok')
        const idx = await buildIndex(
          okNotes.map((n) => ({ source: n.source, notePath: n.sessionId, text: n.markdown })),
          o,
          (done, total) => win?.webContents.send('brain:progress', { phase: 'index', done, total })
        )
        await saveIndex(idx, brainIndexFile())
        const noteIds = new Set(notes.map((n) => n.sessionId))
        const processedIds = convs
          .filter((c) => !isWorthDistilling(c) || noteIds.has(c.id))
          .map((c) => c.id)
        await markProcessed(processedIds)
        if (brainCore.status().running) {
          brainCore.reindex(brainDir()).catch((e) => log.warn('embedded reindex failed:', (e as Error).message))
        }

        let deployed = 0
        let deployMethod: 'filesystem' | 'http' | 'none' = 'none'
        let reindexed = false
        if (opts.autoDeploy && opts.deployUrl && okNotes.length > 0) {
          win?.webContents.send('brain:progress', {
            phase: 'deploy',
            done: 0,
            total: 1,
            detail: 'pushing notes to remote Brain…'
          })
          const dep = await deployDistilledToBrain({
            notesDir: dir,
            dashboardUrl: opts.deployUrl,
            filesystemTarget: opts.deployTarget,
            reindex: opts.reindex !== false
          })
          deployed = dep.copied
          deployMethod = dep.method
          reindexed = dep.reindex
          win?.webContents.send('brain:progress', {
            phase: 'deploy',
            done: 1,
            total: 1,
            detail: dep.method === 'none'
              ? 'deploy skipped — set deploy folder or enable save-note API on Brain'
              : `${dep.copied} note(s) via ${dep.method}${dep.reindex ? ' · reindex ok' : ' · reindex failed'}`
          })
        }

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
      }
    }
  )

  ipcMain.handle('brain:runCancel', () => {
    brainRunAbort?.abort()
    return { ok: true }
  })

  // ── Embedded brain-core (fork lifecycle) ──
  brainCore.onEvent = (e) => win?.webContents.send('brainCore:event', e)
  ipcMain.handle('brainCore:status', () => brainCore.status())
  ipcMain.handle('brainCore:start', async (_e, ollamaUrl?: string) => {
    await brainCore.start({
      dataDir: join(app.getPath('userData'), 'brain-core-data'),
      ollamaUrl,
    })
    return brainCore.status()
  })
  ipcMain.handle('brainCore:stop', async () => brainCore.stop())
  ipcMain.handle('brainCore:reindex', async () => {
    // Index the distilled-notes dir — the same place brain:run deploys to.
    const stats = await brainCore.reindex(brainDir())
    return { stats }
  })
  app.on('before-quit', () => {
    void brainCore.stop()
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
      opts: { to: 'filesystem' | 'dashboard'; target?: string; url?: string; reindex?: boolean; sources?: SourceId[] }
    ) => {
      let detail = ''
      if (opts.to === 'filesystem') {
        if (!opts.target) throw new Error('target dir required')
        await fs.mkdir(opts.target, { recursive: true })
        const files = (await fs.readdir(brainDir())).filter((f) => f.endsWith('.md'))
        for (const f of files) await fs.copyFile(join(brainDir(), f), join(opts.target, f))
        detail = `Copied ${files.length} notes → ${opts.target}`
      } else {
        const convs = await collectLive(opts.sources ?? [])
        const r = await deployDashboard(convs, opts.url || 'http://localhost:7860')
        detail = `Pushed to Brain: ${r.ok} ok, ${r.failed} failed`
      }
      if (opts.reindex && opts.url) {
        const ok = await triggerReindex(opts.url)
        detail += ok ? ' · reindex triggered' : ' · reindex failed'
      }
      return { detail }
    }
  )

  // ── Connect to Brain (status read + copy-paste snippets, no auto-deploy) ──
  ipcMain.handle('connect:status', async (_e, brainUrl?: string, token?: string, target?: 'embedded' | 'remote') => {
    const url =
      brainUrl ||
      (target === 'embedded' ? 'http://127.0.0.1:7862' : 'http://brain.example.local:7862')
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
    syncSkills(brainUrl, join(app.getPath('userData'), 'brain-skills'), { token })
  )

  ipcMain.handle(
    'connect:mcpTokenCreate',
    (_e, brainUrl: string, name: string, adminToken?: string) =>
      createMcpToken(brainUrl, name, { token: adminToken }),
  )

  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
