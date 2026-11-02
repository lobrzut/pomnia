// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * electron-builder update manifests (latest.yml, latest-linux.yml, latest-mac.yml).
 *
 * A manifest that names a blockmap the release does not carry makes the updater
 * look for a file that 404s. The other failure is two macOS jobs each uploading
 * `latest-mac.yml` and the second one erasing the first architecture. Both are
 * fixed here, before anything is published.
 */

export type ManifestClaims = {
  files: string[]
  blockmaps: string[]
}

function unquote(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function urlOnLine(line: string): string | null {
  const listed = line.match(/^\s*-\s+url:\s*(\S+)\s*$/)
  if (listed) return unquote(listed[1])
  const path = line.match(/^path:\s*(\S+)\s*$/)
  if (path) return unquote(path[1])
  return null
}

/** Artifact names a manifest points at, plus blockmaps implied by blockMapSize. */
export function manifestClaims(body: string): ManifestClaims {
  const files: string[] = []
  const blockmaps: string[] = []
  let current = ''
  for (const line of body.split(/\r?\n/)) {
    const url = urlOnLine(line)
    if (url) {
      current = url
      if (!files.includes(url)) files.push(url)
      continue
    }
    if (/^\s*blockMapSize:\s*\d+/.test(line) && current && !current.endsWith('.blockmap')) {
      const bm = `${current}.blockmap`
      if (!blockmaps.includes(bm)) blockmaps.push(bm)
    }
  }
  return { files, blockmaps }
}

/**
 * Drop blockMapSize lines whose `.blockmap` is not in `present`.
 * The returned `blockmaps` are the ones still claimed, which the publisher
 * must upload.
 */
export function reconcileUpdateManifest(
  body: string,
  present: ReadonlySet<string>,
): { body: string; blockmaps: string[] } {
  const lines = body.split(/\r?\n/)
  const trailing = body.endsWith('\n')
  const out: string[] = []
  const kept: string[] = []
  let current = ''
  for (const line of lines) {
    const url = urlOnLine(line)
    if (url) current = url
    if (/^\s*blockMapSize:\s*\d+/.test(line)) {
      const bm = current.endsWith('.blockmap') ? current : `${current}.blockmap`
      if (!bm || !present.has(bm)) continue
      if (!kept.includes(bm)) kept.push(bm)
    }
    out.push(line)
  }
  let text = out.join('\n')
  if (trailing && !text.endsWith('\n')) text += '\n'
  return { body: text, blockmaps: kept }
}

/** Names the manifest requires that are not in the release asset list. */
export function unmetManifestClaims(body: string, assetNames: readonly string[]): string[] {
  const have = new Set(assetNames)
  const claims = manifestClaims(body)
  const missing: string[] = []
  for (const name of [...claims.files, ...claims.blockmaps]) {
    if (!have.has(name)) missing.push(name)
  }
  return missing
}

/**
 * One latest-mac.yml for both architectures.
 *
 * Each CI job emits a manifest that only knows its own DMG. Uploading both
 * under the same asset name keeps whichever job finished last. electron-updater
 * picks the arch from the `files` list, so the merged file lists both.
 */
export function mergeMacUpdateManifests(parts: string[]): string {
  const usable = parts.map((p) => p.trim()).filter(Boolean)
  if (usable.length === 0) throw new Error('no macOS update manifests to merge')

  const files = new Map<string, string[]>()
  let version = ''
  let releaseDate = ''

  for (const part of usable) {
    const versionMatch = part.match(/^version:\s*(\S+)/m)
    if (versionMatch) version = versionMatch[1]
    const dateMatch = part.match(/^releaseDate:\s*(.+)$/m)
    if (dateMatch) releaseDate = dateMatch[1].trim()

    let block: string[] | null = null
    let url = ''
    const flush = (): void => {
      if (block && url) files.set(url, block.filter((line) => line.trim() !== ''))
      block = null
      url = ''
    }
    for (const line of part.split(/\r?\n/)) {
      const start = line.match(/^\s*-\s+url:\s*(\S+)\s*$/)
      if (start) {
        flush()
        url = unquote(start[1])
        block = [`  - url: ${url}`]
        continue
      }
      if (block && /^\s+\S/.test(line)) {
        block.push(line.startsWith('  ') ? line : `  ${line.trim()}`)
        continue
      }
      if (block && line.trim() === '') continue
      flush()
    }
    flush()
  }

  if (!version) throw new Error('macOS update manifest has no version')
  const urls = [...files.keys()]
  const primary =
    urls.find((u) => /-arm64\.dmg$/.test(u)) ??
    urls.find((u) => u.endsWith('.dmg')) ??
    urls[0]
  if (!primary) throw new Error('macOS update manifest lists no files')
  const shaLine = (files.get(primary) ?? []).find((line) => /^\s*sha512:/.test(line))
  const sha = shaLine ? shaLine.replace(/^\s*sha512:\s*/, '').trim() : ''

  let yml = `version: ${version}\nfiles:\n`
  for (const block of files.values()) yml += `${block.join('\n')}\n`
  yml += `path: ${primary}\n`
  if (sha) yml += `sha512: ${sha}\n`
  if (releaseDate) yml += `releaseDate: ${releaseDate}\n`
  return yml
}
