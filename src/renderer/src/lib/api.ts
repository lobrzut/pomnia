import type {
  BackupProgressEvent,
  BrainHit,
  BrainPing,
  BrainProgressEvent,
  BrainRunResult,
  BrainStatus,
  ClientId,
  ClientStatus,
  Conversation,
  ConversationMeta,
  DetectedSource,
  SkillListEntry,
  SkillSyncResult,
  Snapshot,
  Snippet,
  SourceId,
  TextHit,
  VaultStatus
} from './types'

/** The bridge exposed by preload as window.reliqua. */
export interface ReliquaBridge {
  platform: string
  scan(): Promise<DetectedSource[]>
  vaultStatus(): Promise<VaultStatus>
  pickDirectory(): Promise<string | null>
  pickFile(): Promise<string | null>
  createVault(path: string, name: string, passphrase: string): Promise<VaultStatus>
  openVault(path: string, passphrase: string): Promise<VaultStatus>
  lockVault(): Promise<void>
  listSnapshots(): Promise<Snapshot[]>
  backup(sources: SourceId[], note?: string): Promise<Snapshot[]>
  onBackupProgress(cb: (e: BackupProgressEvent) => void): () => void
  verify(): Promise<{ ok: boolean; checked: number; errors: string[] }>
  getConversations(snapshotId: string): Promise<Conversation[]>
  vaultConversations(): Promise<ConversationMeta[]>
  vaultConversation(snapshotId: string, id: string): Promise<Conversation | null>
  vaultSearchText(query: string): Promise<TextHit[]>
  importToVault(path: string): Promise<{ sealed: number; sources: { source: string; count: number }[] }>
  brainExport(snapshotId: string, outDir: string): Promise<{ count: number; dir: string }>
  revealPath(p: string): Promise<void>
  brainStatus(ollamaUrl?: string): Promise<BrainStatus>
  brainRun(opts: {
    sources: SourceId[]
    limit?: number
    model?: string
    ollamaUrl?: string
    importPath?: string
  }): Promise<BrainRunResult>
  onBrainProgress(cb: (e: BrainProgressEvent) => void): () => void
  brainSearch(query: string, ollamaUrl?: string): Promise<BrainHit[]>
  brainDeploy(opts: {
    to: 'filesystem' | 'dashboard'
    target?: string
    url?: string
    reindex?: boolean
    sources?: SourceId[]
  }): Promise<{ detail: string }>
  connectStatus(brainUrl?: string, token?: string): Promise<{ clients: ClientStatus[]; brain: BrainPing }>
  connectSnippet(clientId: ClientId, brainUrl: string, token?: string): Promise<Snippet>
  connectSkillsList(brainUrl: string, token?: string): Promise<SkillListEntry[]>
  connectSkillsSync(brainUrl: string, token?: string): Promise<SkillSyncResult>
  minimize(): void
  toggleMaximize(): void
  close(): void
}

/* ── Mock bridge for browser preview (no Electron) ──────────────────────── */
function mockBridge(): ReliquaBridge {
  const demoSources: DetectedSource[] = [
    { id: 'claude-code', label: 'Claude Code', strategy: 'hybrid', installed: true, root: '~/.claude', os: 'win32', sizeBytes: 7.2e6, conversations: 38, notes: ['JSONL transcripts per session'] },
    { id: 'cursor', label: 'Cursor', strategy: 'hybrid', installed: true, root: '~/AppData/Roaming/Cursor/User', os: 'win32', sizeBytes: 1.6e7, conversations: 21, notes: ['Chats live in state.vscdb (SQLite)'] },
    { id: 'claude-desktop', label: 'Claude Desktop', strategy: 'snapshot', installed: true, root: '~/AppData/Roaming/Claude', os: 'win32', sizeBytes: 8.5e6, notes: ['Mostly cloud-synced; local config captured'] },
    { id: 'antigravity', label: 'Antigravity', strategy: 'snapshot', installed: true, root: '~/AppData/Roaming/Antigravity', os: 'win32', sizeBytes: 7.6e3, notes: ['Google IDE (Windsurf lineage)'] },
    { id: 'vscode', label: 'VS Code', strategy: 'snapshot', installed: true, root: '~/AppData/Roaming/Code/User', os: 'win32', sizeBytes: 3.4e5 }
  ]
  let status: VaultStatus = { open: false, snapshots: 0 }
  let snaps: Snapshot[] = []
  const mkSnap = (id: SourceId, label: string, n: number): Snapshot => ({
    id: crypto.randomUUID(),
    createdAt: new Date(Date.now() - Math.random() * 6e8).toISOString(),
    source: { id, label, strategy: 'hybrid', root: '~', os: 'win32' },
    stats: { conversations: n, messages: n * 22, files: n * 3, bytes: n * 1.2e6 },
    origin: { host: 'WIN-DESK', user: 'Admin', home: 'C:\\Users\\Admin' }
  })
  return {
    platform: 'browser',
    async scan() {
      await new Promise((r) => setTimeout(r, 600))
      return demoSources
    },
    async vaultStatus() {
      return status
    },
    async pickDirectory() {
      return 'C:/Users/Alice/Reliqua.reliqua'
    },
    async pickFile() {
      return 'C:/Users/Alice/Downloads/claude-export.zip'
    },
    async createVault(path, name) {
      status = { open: true, path, name, snapshots: 0 }
      return status
    },
    async openVault(path, _pass) {
      snaps = [mkSnap('claude-code', 'Claude Code', 38), mkSnap('cursor', 'Cursor', 21)]
      status = { open: true, path, name: 'Demo Vault', snapshots: snaps.length }
      return status
    },
    async lockVault() {
      status = { open: false, snapshots: 0 }
      snaps = []
    },
    async listSnapshots() {
      return snaps
    },
    async backup(sources) {
      await new Promise((r) => setTimeout(r, 1200))
      const made = sources.map((s) => mkSnap(s, demoSources.find((d) => d.id === s)?.label ?? s, 10))
      snaps = [...made, ...snaps]
      status = { ...status, snapshots: snaps.length }
      return made
    },
    onBackupProgress() {
      return () => {}
    },
    async verify() {
      return { ok: true, checked: 132, errors: [] }
    },
    async getConversations() {
      return [
        {
          id: 'demo',
          source: 'claude-code',
          title: 'Designing the Reliqua vault',
          messages: [
            { role: 'user', text: 'How should the vault dedupe files?' },
            { role: 'assistant', text: 'Content-addressed blobs keyed by SHA-256 — identical files store once.' }
          ]
        } as Conversation
      ]
    },
    async vaultConversations() {
      const demo: { id: string; source: SourceId; title: string; messages: number; updatedAt: string }[] = [
        { id: 'd1', source: 'claude-code', title: 'Designing the Reliqua vault', messages: 42, updatedAt: '2026-06-10T20:00:00Z' },
        { id: 'd2', source: 'cursor', title: 'MikroTik WireGuard killswitch', messages: 18, updatedAt: '2026-06-09T12:00:00Z' },
        { id: 'd3', source: 'claude-code', title: 'Pine Script non-repaint ATR stop', messages: 26, updatedAt: '2026-06-07T09:00:00Z' },
        { id: 'd4', source: 'cursor', title: 'Bug bounty IDOR methodology', messages: 31, updatedAt: '2026-06-05T18:00:00Z' }
      ]
      return demo.map((d) => ({ ...d, snapshotId: 'snap' }))
    },
    async vaultConversation(_sid, id) {
      return {
        id,
        source: 'claude-code',
        title: 'Designing the Reliqua vault',
        messages: [
          { role: 'user', text: 'How should the vault dedupe files across snapshots?' },
          { role: 'assistant', text: 'Use content-addressed blobs keyed by SHA-256: identical files store once, snapshots reference the hash.' },
          { role: 'user', text: 'And cross-platform restore?' },
          { role: 'assistant', text: 'Remap the home dir + Claude Code project-dir encoding from the origin OS to the target OS.' }
        ]
      } as Conversation
    },
    async importToVault() {
      await new Promise((r) => setTimeout(r, 700))
      return { sealed: 42, sources: [{ source: 'claude-ai', count: 38 }, { source: 'chatgpt', count: 4 }] }
    },
    async vaultSearchText(query) {
      return [
        { snapshotId: 'snap', id: 'd2', source: 'cursor', title: 'MikroTik WireGuard killswitch', snippet: `…${query}… routing-mark + blackhole route on RouterOS 7…`, matches: 3 },
        { snapshotId: 'snap', id: 'd1', source: 'claude-code', title: 'Designing the Reliqua vault', snippet: `…${query}… content-addressed dedup…`, matches: 1 }
      ]
    },
    async brainExport(_id, dir) {
      return { count: 38, dir }
    },
    async revealPath() {},
    async brainStatus() {
      return {
        reachable: true,
        baseUrl: 'http://localhost:11434',
        chatModel: 'qwen2.5:14b',
        embedModel: 'nomic-embed-text',
        models: ['qwen2.5:14b', 'nomic-embed-text', 'deepseek-r1:32b', 'llama3.1:8b']
      }
    },
    async brainRun() {
      await new Promise((r) => setTimeout(r, 1400))
      return { notesDir: 'C:/…/brain-notes', notes: 38, stubs: 4, chunks: 121, dim: 768 }
    },
    onBrainProgress() {
      return () => {}
    },
    async brainSearch(query) {
      return [
        { score: 0.82, source: 'claude-code', notePath: 'reliqua-design.md', text: `Match for "${query}": content-addressed blobs keyed by SHA-256, dedup identical files…` },
        { score: 0.71, source: 'cursor', notePath: 'mikrotik-wireguard.md', text: 'WireGuard killswitch via routing mark + NordVPN endpoint rotation…' }
      ]
    },
    async brainDeploy() {
      return { detail: 'Deployed 38 notes to Brain vault; reindex triggered.' }
    },
    async connectStatus() {
      await new Promise((r) => setTimeout(r, 500))
      return {
        brain: { url: 'http://brain.example.local:7862/healthz', reachable: true, status: 200, data: { notes: 1731, sessions: 49, library_docs: 42 } },
        clients: [
          { id: 'claude-code', label: 'Claude Code (CLI)', configPath: '~/.claude.json', configExists: true, state: 'wired',
            servers: [
              { key: 'brain-rag', present: true, url: 'http://brain.example.local:7862/sse', transport: 'http' },
              { key: 'brain-vault', present: true, url: 'http://brain.example.local:7862/servers/brain-vault/sse', transport: 'http' },
              { key: 'brain-library', present: true, url: 'http://brain.example.local:7862/servers/brain-library/sse', transport: 'http' }
            ], issues: [] },
          { id: 'cursor', label: 'Cursor', configPath: '~/.cursor/mcp.json', configExists: true, state: 'wired',
            servers: [
              { key: 'brain-rag', present: true, url: 'http://brain.example.local:7862/sse' },
              { key: 'brain-vault', present: true, url: 'http://brain.example.local:7862/servers/brain-vault/sse' },
              { key: 'brain-library', present: true, url: 'http://brain.example.local:7862/servers/brain-library/sse' }
            ], issues: [] },
          { id: 'antigravity', label: 'Antigravity (Google IDE)', configPath: '~/.gemini/antigravity-ide/mcp_config.json', configExists: true, state: 'partial',
            servers: [{ key: 'brain-rag', present: true, url: 'http://brain.example.local:7862/mcp', transport: 'streamable-http' }],
            issues: ['brain-vault: missing', 'brain-library: missing'] },
          { id: 'claude-desktop', label: 'Claude Desktop', configPath: '~/AppData/Roaming/Claude/claude_desktop_config.json', configExists: false, state: 'not_wired', servers: [], issues: ['config file does not exist'] },
          { id: 'vscode', label: 'VS Code (1.103+ native MCP)', configPath: '~/AppData/Roaming/Code/User/mcp.json', configExists: false, state: 'not_wired', servers: [], issues: ['config file does not exist'] },
          { id: 'windsurf', label: 'Windsurf (Codeium)', configPath: '~/AppData/Roaming/Windsurf/User/mcp.json', configExists: false, state: 'not_wired', servers: [], issues: ['config file does not exist'] }
        ]
      } as { clients: ClientStatus[]; brain: BrainPing }
    },
    async connectSnippet(clientId, brainUrl) {
      return {
        client: clientId,
        label: clientId,
        filePath: '~/.example/mcp.json',
        mcpKey: 'mcpServers',
        fullFileJson: `{\n  "mcpServers": {\n    "brain-rag": { "type": "http", "url": "${brainUrl}/sse" }\n  }\n}\n`,
        mergeJson: `{\n  "brain-rag": { "type": "http", "url": "${brainUrl}/sse" }\n}\n`,
        instructions: `▶ ${clientId}\n\n1. Open or create the config file.\n2. Paste the snippet.\n3. Restart the client.`,
        restartHint: 'Restart the client to pick up the new config.',
        notes: 'Mock snippet (browser preview). Run inside Reliqua for the real per-client config.'
      }
    },
    async connectSkillsList() {
      return [
        { kind: 'brain', name: 'trading-digest', description: 'Zbiera notatki tradingowe z vault…', model: 'qwen2.5:14b' },
        { kind: 'cli', name: '09-web-security', description: 'Web hacking / bug bounty expertise' }
      ] as SkillListEntry[]
    },
    async connectSkillsSync() {
      await new Promise((r) => setTimeout(r, 700))
      return { fetched: 12, written: 12, errors: [] } as SkillSyncResult
    },
    minimize() {},
    toggleMaximize() {},
    close() {}
  }
}

export const api: ReliquaBridge =
  typeof window !== 'undefined' && (window as any).reliqua
    ? ((window as any).reliqua as ReliquaBridge)
    : mockBridge()

export const isMock = api.platform === 'browser'
