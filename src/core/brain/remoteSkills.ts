// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Read and change the skills that live on the server, without a vault.
 *
 * Skills are files in the vault — `skills/brain/*.md` for workflow recipes,
 * `skills/cli/<name>/SKILL.md` for expertise injections — and the full app
 * edits them because it holds the vault. Mini does not, so until now it could
 * neither see them nor touch them.
 *
 * It does not need to. The replication endpoints are a file API: `/sync/manifest`
 * lists every path with its hash and size, `/sync/fetch` returns one, and
 * `/sync/file` writes one back. That is the same door the import already uses,
 * with the same admin token, and it is the path that carries these files
 * between machines every day anyway.
 *
 * There is no `/admin/skills`. brain-core answers 401 to everything under
 * `/admin/` before it matches a route, which is why probing that path looked
 * like a hit and was not.
 */

export interface RemoteSkill {
  /** Vault-relative path, e.g. `skills/brain/bug-recon.md`. */
  path: string
  /** `brain` = workflow recipe, `cli` = expertise injection, `other` = neither. */
  kind: 'brain' | 'cli' | 'other'
  /** What a person would call it: the file stem, or the directory for a CLI skill. */
  name: string
  size: number
  sha256?: string
}

interface ManifestEntry {
  path: string
  size?: number
  sha256?: string
}

/**
 * Name a skill the way its author would.
 *
 * `skills/cli/think-for-me/SKILL.md` is the "think-for-me" skill, not the
 * "SKILL" skill — the directory carries the name and the file never varies.
 */
export function skillFromPath(path: string, size = 0, sha256?: string): RemoteSkill | null {
  if (!path.startsWith('skills/')) return null
  const parts = path.split('/')
  if (parts[1] === 'brain' && parts.length === 3 && parts[2].endsWith('.md')) {
    return { path, kind: 'brain', name: parts[2].replace(/\.md$/, ''), size, sha256 }
  }
  if (parts[1] === 'cli' && parts.length === 4 && parts[3] === 'SKILL.md') {
    return { path, kind: 'cli', name: parts[2], size, sha256 }
  }
  // Anything else under skills/ is still a real file someone put there;
  // hiding it would make the list disagree with the directory.
  if (parts.length < 2 || !parts[parts.length - 1]) return null
  return { path, kind: 'other', name: parts.slice(1).join('/'), size, sha256 }
}

/** Skills in the manifest, named and sorted the way a list wants them. */
export function skillsFromManifest(entries: unknown): RemoteSkill[] {
  if (!Array.isArray(entries)) return []
  const out: RemoteSkill[] = []
  for (const e of entries as ManifestEntry[]) {
    if (!e || typeof e.path !== 'string') continue
    const s = skillFromPath(e.path, typeof e.size === 'number' ? e.size : 0, e.sha256)
    if (s) out.push(s)
  }
  // Grouped by kind, then alphabetical: 772 files in one flat run is a wall.
  const rank = { brain: 0, cli: 1, other: 2 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.name.localeCompare(b.name))
}

/** `skills/…` and nothing above it. A path that escapes is a path that overwrites. */
export function isSafeSkillPath(path: string): boolean {
  if (!path.startsWith('skills/')) return false
  if (path.includes('\\')) return false
  return !path.split('/').some((p) => p === '..' || p === '.' || p === '')
}
