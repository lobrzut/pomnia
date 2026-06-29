import path from 'node:path'
import type { CaptureStrategy, OS, SourceId } from './model.js'
import { appDataRoot } from './platform.js'

/**
 * Declarative description of where each assistant keeps its data on each OS,
 * and how Reliqua should treat it. Adapters consume these descriptors.
 */
export interface SourceDescriptor {
  id: SourceId
  label: string
  strategy: CaptureStrategy
  /** Resolve the source root for a target OS + home dir. null → not applicable. */
  root: (targetOS: OS, home: string) => string | null
  /** Directory/file names to skip entirely during snapshot capture (cache-like). */
  exclude: string[]
  /**
   * If set, snapshot capture keeps ONLY paths whose first segment matches one of
   * these (relative to root). Used to avoid hoovering multi-GB cache trees.
   */
  keepTop?: string[]
  /** These files commonly embed absolute machine paths → remap on cross-host restore. */
  pathSensitive: string[]
  notes?: string[]
}

/** Cache/junk directory names common to all Electron/Chromium-based apps. */
const CHROMIUM_JUNK = [
  'Cache',
  'GPUCache',
  'Code Cache',
  'CachedData',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
  'blob_storage',
  'Crashpad',
  'Service Worker',
  'logs',
  'sentry',
  'Partitions',
  'component_crx_cache',
  'Dictionaries',
  'Shared Dictionary'
]

function appData(os: OS, home: string, app: string): string {
  const base = appDataRoot(os, home)
  return (os === 'win32' ? path.win32 : path.posix).join(base, app)
}

function join(os: OS, ...parts: string[]): string {
  return (os === 'win32' ? path.win32 : path.posix).join(...parts)
}

export const SOURCES: SourceDescriptor[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    strategy: 'hybrid',
    root: (os, home) => join(os, home, '.claude'),
    exclude: ['statsig', 'telemetry', '.last-cleanup', 'shell-snapshots'],
    keepTop: ['projects', 'sessions', 'settings.json', 'plugins', 'CLAUDE.md', 'commands', 'agents', 'memory'],
    pathSensitive: ['settings.json', 'projects'],
    notes: ['Project dir names encode the working directory path', 'JSONL transcripts per session']
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    strategy: 'snapshot',
    root: (os, home) =>
      os === 'win32'
        ? appData(os, home, 'Claude')
        : os === 'darwin'
          ? join(os, home, 'Library', 'Application Support', 'Claude')
          : appData(os, home, 'Claude'),
    exclude: [...CHROMIUM_JUNK, 'Network'],
    keepTop: [
      'claude_desktop_config.json',
      'config.json',
      'claude-code',
      'claude-code-sessions',
      'local-agent-mode-sessions',
      'Local Storage',
      'Session Storage',
      'IndexedDB',
      'WebStorage'
    ],
    pathSensitive: ['claude_desktop_config.json', 'config.json'],
    notes: ['Most chats are cloud-synced; local config + agent sessions captured', 'MCP server config lives in claude_desktop_config.json']
  },
  {
    id: 'cursor',
    label: 'Cursor',
    strategy: 'hybrid',
    root: (os, home) =>
      os === 'win32'
        ? join(os, appData(os, home, 'Cursor'), 'User')
        : os === 'darwin'
          ? join(os, home, 'Library', 'Application Support', 'Cursor', 'User')
          : join(os, appData(os, home, 'Cursor'), 'User'),
    exclude: [...CHROMIUM_JUNK, 'History'],
    keepTop: ['globalStorage', 'workspaceStorage', 'settings.json', 'keybindings.json', 'snippets'],
    pathSensitive: ['settings.json', 'globalStorage/storage.json'],
    notes: ['Chats/composers live in globalStorage/state.vscdb (SQLite)', 'WAL present → checkpoint before copy']
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    strategy: 'snapshot',
    root: (os, home) =>
      os === 'win32'
        ? appData(os, home, 'Antigravity')
        : os === 'darwin'
          ? join(os, home, 'Library', 'Application Support', 'Antigravity')
          : appData(os, home, 'Antigravity'),
    exclude: [...CHROMIUM_JUNK, 'Network', 'bin'],
    keepTop: [
      'app_storage.json',
      'Preferences',
      'Local State',
      'SharedStorage',
      'Local Storage',
      'Session Storage',
      'User'
    ],
    pathSensitive: ['app_storage.json', 'Preferences', 'Local State'],
    notes: ['Google IDE (Windsurf/VS Code lineage)', 'Cascade/agent state in Local Storage + SharedStorage']
  },
  {
    id: 'vscode',
    label: 'VS Code',
    strategy: 'snapshot',
    root: (os, home) =>
      os === 'win32'
        ? join(os, appData(os, home, 'Code'), 'User')
        : os === 'darwin'
          ? join(os, home, 'Library', 'Application Support', 'Code', 'User')
          : join(os, appData(os, home, 'Code'), 'User'),
    exclude: [...CHROMIUM_JUNK, 'History', 'workspaceStorage'],
    keepTop: ['settings.json', 'keybindings.json', 'snippets', 'globalStorage'],
    pathSensitive: ['settings.json'],
    notes: ['Copilot/Continue chat may live in globalStorage', 'Settings + snippets captured for portability']
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    strategy: 'snapshot',
    root: (os, home) =>
      os === 'win32'
        ? join(os, appData(os, home, 'Windsurf'), 'User')
        : os === 'darwin'
          ? join(os, home, 'Library', 'Application Support', 'Windsurf', 'User')
          : join(os, appData(os, home, 'Windsurf'), 'User'),
    exclude: [...CHROMIUM_JUNK, 'History', 'workspaceStorage'],
    keepTop: ['settings.json', 'keybindings.json', 'snippets', 'globalStorage'],
    pathSensitive: ['settings.json'],
    notes: ['Codeium lineage; Cascade state in globalStorage']
  },
  {
    id: 'continue',
    label: 'Continue',
    strategy: 'snapshot',
    root: (os, home) => join(os, home, '.continue'),
    exclude: ['index', 'dev_data', 'logs', '.utils'],
    keepTop: ['config.json', 'config.yaml', 'config.ts', 'sessions', '.continuerc.json', 'assistants'],
    pathSensitive: ['config.json', 'config.yaml'],
    notes: ['Open-source IDE assistant (VS Code/JetBrains)', 'Sessions stored as JSON in ~/.continue/sessions']
  }
]

export function descriptorFor(id: SourceId): SourceDescriptor | undefined {
  return SOURCES.find((s) => s.id === id)
}
