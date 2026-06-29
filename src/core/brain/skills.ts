/**
 * Brain skills sync — fetch skill catalogs from a brain server and persist them
 * locally so Reliqua works the same whether you're online or offline.
 *
 * Two skill kinds are mirrored, matching how brain exposes them:
 *   - "brain"  → workflow recipes (brain/skills/*.md), listed by /api/skills/list,
 *                fetched by /api/skills/get?name=<n>
 *   - "cli"    → expertise injections (~/.claude/skills/<n>/SKILL.md), listed by
 *                /api/cli-skills/list, fetched by /api/cli-skills/get?name=<n>
 *
 * Local layout (under <vaultRoot>/skills/):
 *   brain/<name>.md            ← workflow skills
 *   cli/<name>/SKILL.md        ← CLI expertise skills
 *   index.json                 ← {kind, name, description, mtime, syncedAt}[]
 *
 * Sync is one-way (server → local). The server stays canonical; conflicts are
 * resolved by overwriting local with server.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { log } from '../log.js'

export type SkillKind = 'brain' | 'cli'

export interface SkillListEntry {
  kind: SkillKind
  /** Filename without .md (brain) or folder name (cli). */
  name: string
  description?: string
  model?: string
}

export interface SkillSyncResult {
  fetched: number
  written: number
  errors: { name: string; reason: string }[]
}

interface AuthOpts {
  /** Optional bearer token. Once MCP auth proxy is in front of brain, all
   *  /api endpoints will also be gated; for now most are unauthenticated. */
  token?: string
}

function authHeaders(opts: AuthOpts): Record<string, string> {
  return opts.token ? { Authorization: `Bearer ${opts.token}` } : {}
}

async function getJSON<T>(url: string, opts: AuthOpts): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json', ...authHeaders(opts) } })
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`)
  return (await r.json()) as T
}

/** Fetch the full server-side catalog of both skill kinds. */
export async function listAllSkills(baseUrl: string, opts: AuthOpts = {}): Promise<SkillListEntry[]> {
  const base = baseUrl.replace(/\/$/, '')
  const out: SkillListEntry[] = []

  try {
    const r = await getJSON<{ skills?: Array<{ name?: string; file?: string; description?: string; model?: string }> }>(
      `${base}/api/skills/list`,
      opts
    )
    for (const s of r.skills ?? []) {
      const name = s.name ?? (s.file ?? '').replace(/\.md$/, '')
      if (name) out.push({ kind: 'brain', name, description: s.description, model: s.model })
    }
  } catch (e) {
    log.warn('brain skills list failed', e)
  }

  try {
    const r = await getJSON<{ skills?: Array<{ id?: string; name?: string; description?: string }> }>(
      `${base}/api/cli-skills/list`,
      opts
    )
    for (const s of r.skills ?? []) {
      const name = s.id ?? s.name
      if (name) out.push({ kind: 'cli', name, description: s.description })
    }
  } catch (e) {
    log.warn('cli skills list failed', e)
  }

  return out
}

interface FetchedSkill {
  name: string
  content: string
  mtime?: number
}

async function fetchOne(baseUrl: string, kind: SkillKind, name: string, opts: AuthOpts): Promise<FetchedSkill> {
  const base = baseUrl.replace(/\/$/, '')
  const endpoint = kind === 'brain' ? '/api/skills/get' : '/api/cli-skills/get'
  const url = `${base}${endpoint}?name=${encodeURIComponent(name)}`
  const r = await fetch(url, { headers: { accept: 'application/json', ...authHeaders(opts) } })
  if (!r.ok) throw new Error(`GET ${url} → ${r.status}`)
  const j = (await r.json()) as { name?: string; content?: string; mtime?: number }
  if (!j.content) throw new Error('empty content')
  return { name: j.name ?? name, content: j.content, mtime: j.mtime }
}

async function writeSkill(targetRoot: string, kind: SkillKind, s: FetchedSkill): Promise<string> {
  if (kind === 'brain') {
    const dir = path.join(targetRoot, 'brain')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, `${s.name}.md`)
    await fs.writeFile(file, s.content, 'utf8')
    return file
  }
  const dir = path.join(targetRoot, 'cli', s.name)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, 'SKILL.md')
  await fs.writeFile(file, s.content, 'utf8')
  return file
}

/**
 * Pull every skill listed by the server and persist locally. Idempotent: a
 * re-run with no server-side changes is a no-op write. Returns a stat summary.
 */
export async function syncSkills(
  baseUrl: string,
  targetRoot: string,
  opts: AuthOpts = {}
): Promise<SkillSyncResult> {
  const catalog = await listAllSkills(baseUrl, opts)
  const result: SkillSyncResult = { fetched: 0, written: 0, errors: [] }
  const index: Array<SkillListEntry & { syncedAt: string; localPath: string; mtime?: number }> = []
  const now = new Date().toISOString()

  for (const entry of catalog) {
    try {
      const s = await fetchOne(baseUrl, entry.kind, entry.name, opts)
      result.fetched++
      const localPath = await writeSkill(targetRoot, entry.kind, s)
      result.written++
      index.push({ ...entry, syncedAt: now, localPath, mtime: s.mtime })
    } catch (e) {
      result.errors.push({ name: `${entry.kind}:${entry.name}`, reason: String(e) })
    }
  }

  await fs.mkdir(targetRoot, { recursive: true })
  await fs.writeFile(path.join(targetRoot, 'index.json'), JSON.stringify(index, null, 2), 'utf8')
  log.info('skills synced', result.fetched, 'fetched,', result.written, 'written,', result.errors.length, 'errors')
  return result
}

/** Read the local index written by syncSkills. Returns [] if not synced yet. */
export async function readLocalIndex(
  targetRoot: string
): Promise<Array<SkillListEntry & { syncedAt: string; localPath: string }>> {
  try {
    const raw = await fs.readFile(path.join(targetRoot, 'index.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}
