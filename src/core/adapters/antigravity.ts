// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { conversationTitle } from './conversationTitle.js'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import type { BackupOptions, Conversation, DetectedSource, Message, OS } from '../model.js'
import { antigravityProfileRoots, descriptorFor } from '../locations.js'
import { currentOS, homeDir } from '../platform.js'
import { dirSize, pathExists, walk } from '../fsutil.js'
import { log } from '../log.js'
import { baseDetect, collectFilesFromDescriptor } from './base.js'
import { queryItemTable, vscdbPath } from './vscdb.js'
import type { Adapter, CollectedFile } from './types.js'
import { DEFAULT_MAX_FILE } from './types.js'

const ID = 'antigravity' as const

/**
 * Chats do not live in the IDE profile (`Antigravity` / `Antigravity IDE`).
 * A current IDE writes `~/.gemini/antigravity-ide/brain/<id>/.system_generated/logs/`.
 * The older agent tree is `~/.gemini/antigravity`. The `agy` CLI uses
 * `~/.gemini/antigravity-cli` (some Linux builds: `~/.antigravity-cli/brain`).
 * `transcript.jsonl` is the short log; `transcript_full.jsonl` is the complete
 * one when both exist. SQLite `conversations/*.db` and protobuf sessions are
 * not parsed — that schema is not published.
 */
const GEMINI_SURFACES: Array<{ surface: string; dirName: string }> = [
  { surface: 'ide', dirName: 'antigravity-ide' },
  { surface: 'legacy', dirName: 'antigravity' },
  { surface: 'cli', dirName: 'antigravity-cli' }
]

const TRANSCRIPT_FILES = ['transcript_full.jsonl', 'transcript.jsonl']

export function geminiAntigravityRoot(home: string): string {
  return path.join(home, '.gemini', 'antigravity')
}

/** Brain directories to scan, current IDE first. Missing dirs are included; callers skip them. */
export function antigravityBrainDirs(home: string): Array<{ surface: string; brain: string }> {
  const dirs = GEMINI_SURFACES.map((s) => ({
    surface: s.surface,
    brain: path.join(home, '.gemini', s.dirName, 'brain')
  }))
  dirs.push({ surface: 'cli', brain: path.join(home, '.antigravity-cli', 'brain') })
  return dirs
}

function stripXmlBlocks(text: string): string {
  const req = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i)
  if (req) return req[1].replace(/\s+/g, ' ').trim()
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function roleFromLine(obj: Record<string, unknown>): Message['role'] | null {
  const type = String(obj.type ?? '')
  const source = String(obj.source ?? '')
  if (type === 'USER_INPUT' || source === 'USER_EXPLICIT') return 'user'
  if (source === 'MODEL' || type.includes('PLANNER') || type.includes('RESPONSE')) return 'assistant'
  if (type === 'CONVERSATION_HISTORY' || (source === 'SYSTEM' && !obj.content)) return null
  if (typeof obj.content === 'string' && obj.content.trim()) {
    if (source.includes('USER')) return 'user'
    return 'assistant'
  }
  return null
}

function textFromLine(obj: Record<string, unknown>): string {
  if (typeof obj.content !== 'string') return ''
  return stripXmlBlocks(obj.content)
}

async function parseTranscriptFile(
  tpath: string,
  sessionId: string,
  surface: string
): Promise<Conversation | null> {
  let raw: string
  try {
    raw = await fs.readFile(tpath, 'utf8')
  } catch {
    return null
  }

  const messages: Message[] = []
  let createdAt: string | undefined
  let title: string | undefined

  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    const ts = typeof obj.created_at === 'string' ? obj.created_at : undefined
    if (ts && !createdAt) createdAt = ts
    const role = roleFromLine(obj)
    const text = textFromLine(obj)
    if (!role || !text) continue
    messages.push({ role, text, ts })
    if (role === 'user' && !title) title = conversationTitle(text)
  }

  if (!messages.length) return null
  return {
    id: sessionId,
    source: ID,
    title: title || sessionId.slice(0, 8),
    messages,
    createdAt,
    meta: { surface }
  }
}

/** First non-empty transcript. `transcript_full.jsonl` wins when it has messages. */
async function conversationFromSession(
  sessionDir: string,
  sessionId: string,
  surface: string
): Promise<Conversation | null> {
  const logDir = path.join(sessionDir, '.system_generated', 'logs')
  for (const name of TRANSCRIPT_FILES) {
    const tpath = path.join(logDir, name)
    if (!(await pathExists(tpath))) continue
    const conv = await parseTranscriptFile(tpath, sessionId, surface)
    if (conv) return conv
  }
  return null
}

/** Parse Cascade transcripts under every known Antigravity brain directory. */
export async function readAntigravityTranscripts(home: string): Promise<Conversation[]> {
  const byId = new Map<string, Conversation>()
  const seenBrains = new Set<string>()

  for (const { surface, brain } of antigravityBrainDirs(home)) {
    let real: string
    try {
      real = await fs.realpath(brain)
    } catch {
      continue
    }
    if (seenBrains.has(real)) continue
    seenBrains.add(real)

    let ents: import('node:fs').Dirent[]
    try {
      ents = await fs.readdir(brain, { withFileTypes: true })
    } catch {
      continue
    }

    for (const ent of ents) {
      if (!ent.isDirectory() || ent.name.startsWith('.') || ent.name === 'tempmediaStorage') continue
      const conv = await conversationFromSession(path.join(brain, ent.name), ent.name, surface)
      if (!conv) continue
      const prev = byId.get(conv.id)
      if (!prev || conv.messages.length > prev.messages.length) byId.set(conv.id, conv)
    }
  }
  return [...byId.values()]
}

/** Optional titles from IDE state.vscdb when a User profile exists. */
async function titlesFromVscdb(appRoot: string): Promise<Map<string, string>> {
  const db = vscdbPath(appRoot, 'User')
  if (!(await pathExists(db))) return new Map()
  const rows = await queryItemTable(db, "key = 'chat.ChatSessionStore.index'")
  const out = new Map<string, string>()
  for (const { value } of rows) {
    try {
      const v = JSON.parse(value) as { entries?: Record<string, { title?: string; sessionId?: string }> }
      for (const [id, ent] of Object.entries(v.entries ?? {})) {
        const title = ent?.title?.trim()
        if (title) out.set(ent.sessionId ?? id, title.slice(0, 80))
      }
    } catch {
      /* ignore */
    }
  }
  return out
}

export async function readAntigravityConversations(
  appRoot: string,
  home = homeDir(),
  os: OS = currentOS()
): Promise<Conversation[]> {
  const convs = await readAntigravityTranscripts(home)
  const titles = new Map<string, string>()
  const profileRoots = [...new Set([appRoot, ...antigravityProfileRoots(os, home)].filter(Boolean))]
  for (const root of profileRoots) {
    const part = await titlesFromVscdb(root)
    for (const [id, title] of part) if (!titles.has(id)) titles.set(id, title)
  }
  for (const c of convs) {
    const t = titles.get(c.id)
    if (t && (c.title === c.id.slice(0, 8) || !c.title)) c.title = t
  }
  return convs
}

export interface AntigravityProbe {
  installed: boolean
  /** Live IDE profile, else the older profile, else a brain dir that exists. */
  root: string
  conversations: Conversation[]
  surfaces: string[]
}

/** Installation + chats for an explicit OS and home. `detect()` uses the current machine. */
export async function probeAntigravity(os: OS, home: string): Promise<AntigravityProbe> {
  const descRoot = descriptorFor(ID)!.root(os, home) ?? ''
  let profile: string | null = null
  for (const p of antigravityProfileRoots(os, home)) {
    if (await pathExists(p)) {
      profile = p
      break
    }
  }

  let brainHit: string | null = null
  for (const b of antigravityBrainDirs(home)) {
    if (await pathExists(b.brain)) {
      brainHit = b.brain
      break
    }
  }

  const conversations = await readAntigravityTranscripts(home)
  const surfaces = [
    ...new Set(conversations.map((c) => String(c.meta?.surface ?? '')).filter(Boolean))
  ]
  const installed = !!profile || !!brainHit
  return {
    installed,
    root: profile ?? brainHit ?? descRoot,
    conversations: installed ? conversations : [],
    surfaces
  }
}

export async function collectAntigravityGeminiFiles(home: string, opts: BackupOptions): Promise<CollectedFile[]> {
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE
  const exclude = ['tempmediaStorage']
  const keepTop = ['brain', 'conversations', 'knowledge', 'annotations', 'mcp_config.json', 'installation_id']
  const files: CollectedFile[] = []
  const seen = new Set<string>()

  const roots: Array<{ label: string; root: string }> = GEMINI_SURFACES.map((s) => ({
    label: s.dirName,
    root: path.join(home, '.gemini', s.dirName)
  }))
  roots.push({ label: 'antigravity-cli-home', root: path.join(home, '.antigravity-cli') })

  for (const { label, root } of roots) {
    let real: string
    try {
      real = await fs.realpath(root)
    } catch {
      continue
    }
    if (seen.has(real)) continue
    seen.add(real)
    for await (const f of walk(root, { exclude, keepTop, maxFileBytes })) {
      files.push({
        ...f,
        relPath: path.posix.join('gemini', label, f.relPath.replace(/\\/g, '/')),
        pathSensitive: false
      })
    }
  }
  return files
}

export const antigravityAdapter: Adapter = {
  id: ID,
  label: 'Antigravity',
  resolveRoot: (os: OS, home: string) => {
    for (const p of antigravityProfileRoots(os, home)) {
      if (existsSync(p)) return p
    }
    for (const b of antigravityBrainDirs(home)) {
      if (existsSync(b.brain)) return b.brain
    }
    return antigravityProfileRoots(os, home).at(-1) ?? descriptorFor(ID)!.root(os, home)
  },

  async detect(): Promise<DetectedSource> {
    const d = await baseDetect(ID)
    const home = homeDir()
    try {
      const probe = await probeAntigravity(d.os, home)
      d.installed = probe.installed
      if (!probe.installed) return d
      d.root = probe.root
      d.conversations = probe.conversations.length
      const desc = descriptorFor(ID)!
      const descRoot = desc.root(d.os, home)
      if (probe.root !== descRoot && antigravityProfileRoots(d.os, home).includes(probe.root)) {
        d.sizeBytes = await dirSize(probe.root, {
          exclude: desc.exclude,
          keepTop: desc.keepTop,
          maxFileBytes: DEFAULT_MAX_FILE
        })
      }
      if (probe.surfaces.length) {
        d.notes = [
          ...(d.notes ?? []),
          `Chats from ${probe.surfaces.join(', ')} (transcript_full.jsonl, else transcript.jsonl).`
        ]
      } else {
        d.notes = [
          ...(d.notes ?? []),
          'No JSONL transcripts found. SQLite conversations/*.db are not parsed.'
        ]
      }
    } catch (e) {
      log.warn('antigravity conversation probe failed:', (e as Error).message)
    }
    return d
  },

  collectConversations(root: string) {
    return readAntigravityConversations(root)
  },

  async collectFiles(root: string, opts: BackupOptions) {
    const os = currentOS()
    const home = homeDir()
    const profiles = [...new Set([root, ...antigravityProfileRoots(os, home)].filter((p): p is string => !!p))]
    const appFiles: CollectedFile[] = []
    const seen = new Set<string>()
    for (const p of profiles) {
      let real: string
      try {
        real = await fs.realpath(p)
      } catch {
        continue
      }
      if (seen.has(real)) continue
      seen.add(real)
      const part = await collectFilesFromDescriptor(ID, p, opts)
      // Files from the snapshot root stay relative to it. Any other profile is
      // prefixed so the two trees cannot overwrite each other.
      const prefix = p === root ? '' : path.basename(p)
      for (const f of part) {
        appFiles.push({
          ...f,
          relPath: prefix ? path.posix.join(prefix, f.relPath.replace(/\\/g, '/')) : f.relPath
        })
      }
    }
    const geminiFiles = await collectAntigravityGeminiFiles(home, opts)
    return [...appFiles, ...geminiFiles]
  }
}
