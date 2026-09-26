// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Shared release asset rules for check / publish / attach / CI.
 *
 * One releases/latest URL serves Windows CTA, Pomnia Mini (the zip), Linux
 * desktop, macOS, and curl|sh (brain-core tarball). A green regex on the wrong
 * version is the same defect as a missing file — patterns are therefore
 * version-bound when the tag/version is known.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

export type AssetClass = {
  id: string
  label: string
  pattern: RegExp
  why: string
  versionOk?: (hit: string) => boolean
}

export type AssessmentRow = {
  id: string
  label: string
  hit: string | null
  why: string
}

export type AssetPlanRow = {
  role: string
  path: string
  note?: string
}

export function versionFromTag(tag: string): string {
  if (!tag || typeof tag !== 'string') throw new Error('tag is required')
  const t = tag.trim()
  if (!t) throw new Error('tag is empty')
  return t.startsWith('v') ? t.slice(1) : t
}

export function tagFromVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

/**
 * True when a filename clearly belongs to this release version.
 * Covers Pomnia-0.1.82.AppImage, pomnia_0.1.82_amd64.deb,
 * pomnia-brain-core-0.1.82-linux-x64.tar.gz, Pomnia-0.1.82-setup.exe.
 */
export function belongsToVersion(name: string, version: string): boolean {
  if (!name || !version) return false
  return (
    name.includes(`-${version}.`) ||
    name.includes(`_${version}_`) ||
    name.includes(`-${version}-`) ||
    name === 'latest.yml' ||
    name === 'latest-linux.yml'
  )
}

export function requiredAssetClasses(version: string): AssetClass[] {
  const v = version.replace(/\./g, '\\.')
  return [
    {
      id: 'win-exe',
      label: 'Windows installer',
      pattern: new RegExp(`^Pomnia-${v}-setup\\.exe$`),
      why: 'the site\'s "Download for Windows" CTA lands here',
    },
    {
      id: 'win-blockmap',
      label: 'Windows blockmap',
      pattern: new RegExp(`^Pomnia-${v}-setup\\.exe\\.blockmap$`),
      why: 'differential download metadata',
    },
    {
      id: 'win-sha',
      label: 'Windows SHA-256',
      pattern: new RegExp(`^Pomnia-${v}-setup\\.exe\\.sha256$`),
      why: 'the site promises a checksum for every release',
    },
    {
      id: 'win-yml',
      label: 'Windows latest.yml',
      pattern: /^latest\.yml$/,
      why: 'update manifest carrying the installer sha512',
    },
    {
      id: 'mini-zip',
      label: 'Pomnia Mini zip',
      pattern: new RegExp(`^PomniaMini-${v}\\.zip$`),
      why: 'Windows Mini download — unpack once and run PomniaMini.exe; the portable exe is not this asset',
    },
    {
      id: 'mini-sha',
      label: 'Pomnia Mini SHA-256',
      pattern: new RegExp(`^PomniaMini-${v}\\.zip\\.sha256$`),
      why: 'same checksum promise as the installer',
    },
    {
      id: 'linux-appimage',
      label: 'Linux AppImage',
      pattern: new RegExp(`(^Pomnia-${v}\\.AppImage$)|(_${v}_.*\\.AppImage$)`),
      why: 'Linux desktop download',
    },
    {
      id: 'linux-deb',
      label: 'Linux deb',
      pattern: new RegExp(`(^Pomnia-${v}\\.deb$)|(pomnia_${v}_.*\\.deb$)`),
      why: 'Linux desktop download',
    },
    {
      id: 'linux-sha',
      label: 'Linux SHA-256',
      pattern: new RegExp(`\\.(AppImage|deb)\\.sha256$`),
      why: 'same checksum promise as Windows',
      versionOk: (hit) => belongsToVersion(hit.replace(/\.sha256$/, ''), version),
    },
    {
      id: 'linux-yml',
      label: 'Linux latest-linux.yml',
      pattern: /^latest-linux\.yml$/,
      why: 'Linux update manifest',
    },
    {
      id: 'mac-x64',
      label: 'macOS Intel DMG',
      // electron-builder: ${productName}-${version}-${arch}.${ext}
      pattern: new RegExp(`^Pomnia-${v}-x64\\.dmg$`),
      why: 'Intel Macs — cross-compiled builds shipped arm64 natives and died on first query',
    },
    {
      id: 'mac-arm64',
      label: 'macOS Apple Silicon DMG',
      pattern: new RegExp(`^Pomnia-${v}-arm64\\.dmg$`),
      why: 'every Mac sold since 2020',
    },
    {
      id: 'mac-sha',
      label: 'macOS SHA-256',
      pattern: /\.dmg\.sha256$/,
      why: 'same checksum promise as Windows and Linux',
      versionOk: (hit) => belongsToVersion(hit.replace(/\.sha256$/, ''), version),
    },
    {
      id: 'brain-tarball',
      label: 'brain-core tarball',
      pattern: new RegExp(`^pomnia-brain-core-${v}-linux-x64\\.tar\\.gz$`),
      why: 'curl | sh resolves this from releases/latest',
    },
    {
      id: 'brain-sha',
      label: 'brain-core SHA-256',
      pattern: new RegExp(`^pomnia-brain-core-${v}-linux-x64\\.tar\\.gz\\.sha256$`),
      why: 'bootstrap.sh verifies the tarball with it',
    },
  ]
}

export function assessReleaseAssets(assetNames: string[], version: string) {
  const names = assetNames ?? []
  const classes = requiredAssetClasses(version)
  const rows: AssessmentRow[] = []
  const missing: string[] = []

  for (const cls of classes) {
    const candidates = names.filter((n) => cls.pattern.test(n))
    let hit = candidates.find((n) => (cls.versionOk ? cls.versionOk(n) : true)) ?? null
    if (!hit && candidates.length && !cls.versionOk) hit = candidates[0]
    rows.push({ id: cls.id, label: cls.label, hit, why: cls.why })
    if (!hit) missing.push(cls.label)
  }

  return {
    version,
    complete: missing.length === 0,
    missing,
    rows,
  }
}

export function computeSha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex').toUpperCase()
}

export function formatSha256Line(hex: string, fileName: string): string {
  return `${hex.toUpperCase()}  ${fileName}\n`
}

export function parseSha256Line(content: string): { hex: string; fileName: string } | null {
  const line = String(content).trim().split(/\r?\n/)[0] ?? ''
  const m = line.match(/^([0-9a-fA-F]{64})\s{1,2}(.+)$/)
  if (!m) return null
  return { hex: m[1].toUpperCase(), fileName: m[2].trim() }
}

export function ensureMatchingSha256(opts: {
  filePath: string
  shaPath?: string
  write?: boolean
}): { ok: true; hex: string; shaPath: string; wrote: boolean } | { ok: false; hex: string; shaPath: string; error: string } {
  const filePath = opts.filePath
  const fileName = basename(filePath)
  const shaPath = opts.shaPath ?? `${filePath}.sha256`
  const write = opts.write !== false
  const hex = computeSha256Hex(readFileSync(filePath))

  if (existsSync(shaPath)) {
    const parsed = parseSha256Line(readFileSync(shaPath, 'utf8'))
    if (!parsed) {
      return { ok: false, hex, shaPath, error: `${basename(shaPath)} is not a valid SHA-256 sidecar` }
    }
    if (parsed.hex !== hex) {
      return {
        ok: false,
        hex,
        shaPath,
        error:
          `SHA-256 mismatch for ${fileName}: file is ${hex}, ${basename(shaPath)} says ${parsed.hex} — ` +
          `refusing to upload a stale checksum (rebuild the sidecar or the binary)`,
      }
    }
    if (parsed.fileName && parsed.fileName !== fileName) {
      return {
        ok: false,
        hex,
        shaPath,
        error: `${basename(shaPath)} names ${parsed.fileName}, not ${fileName}`,
      }
    }
    return { ok: true, hex, shaPath, wrote: false }
  }

  if (write) {
    writeFileSync(shaPath, formatSha256Line(hex, fileName), 'utf8')
    return { ok: true, hex, shaPath, wrote: true }
  }
  return { ok: false, hex, shaPath, error: `missing ${basename(shaPath)}` }
}

export function validateUpdateManifest(
  body: string,
  opts: { version: string; mustInclude?: string[] },
): { ok: true } | { ok: false; error: string } {
  const { version, mustInclude = [] } = opts
  if (!body.includes(version)) {
    return { ok: false, error: `manifest does not mention version ${version}` }
  }
  for (const needle of mustInclude) {
    if (!body.includes(needle)) {
      return { ok: false, error: `manifest does not name ${needle}` }
    }
  }
  return { ok: true }
}

export function collectLinuxDesktopAssets(opts: {
  releaseDir: string
  version: string
  requireManifest?: boolean
}) {
  const { releaseDir, version, requireManifest = true } = opts
  const errors: string[] = []
  const plan: AssetPlanRow[] = []
  const assets: string[] = []

  if (!existsSync(releaseDir)) {
    return { ok: false as const, errors: [`missing ${releaseDir}`], plan, assets, version }
  }

  const names = readdirSync(releaseDir)
  const isLinuxPkg = (n: string) => /\.(AppImage|deb)$/i.test(n) && !n.endsWith('.sha256')
  const pkgs = names.filter(isLinuxPkg)
  const matching = pkgs.filter((n) => belongsToVersion(n, version))
  const foreign = pkgs.filter((n) => !belongsToVersion(n, version))

  if (foreign.length) {
    errors.push(
      `mixed Linux versions in release/: expected ${version}, also found ${foreign.join(', ')}`,
    )
  }

  const appImages = matching.filter((n) => n.endsWith('.AppImage'))
  const debs = matching.filter((n) => n.endsWith('.deb'))
  if (!appImages.length) errors.push(`no Pomnia ${version} AppImage in release/`)
  if (!debs.length) errors.push(`no Pomnia ${version} .deb in release/`)

  for (const name of matching) {
    const full = join(releaseDir, name)
    const sha = ensureMatchingSha256({ filePath: full })
    if (!sha.ok) errors.push(sha.error)
    else {
      plan.push({
        role: name.endsWith('.deb') ? 'deb' : 'appimage',
        path: full,
        note: sha.wrote ? `wrote ${basename(sha.shaPath)}` : `sha256 ${sha.hex.slice(0, 12)}...`,
      })
      assets.push(full, sha.shaPath)
    }
  }

  const ymlName = 'latest-linux.yml'
  const ymlPath = join(releaseDir, ymlName)
  if (existsSync(ymlPath)) {
    const body = readFileSync(ymlPath, 'utf8')
    const needles = [...appImages, ...debs]
    const v = validateUpdateManifest(body, { version, mustInclude: needles.length ? [needles[0]] : [] })
    if (!v.ok) errors.push(`latest-linux.yml: ${v.error}`)
    else {
      plan.push({ role: 'manifest', path: ymlPath })
      assets.push(ymlPath)
    }
  } else if (requireManifest) {
    errors.push('missing release/latest-linux.yml — electron-builder should emit it beside AppImage/deb')
  }

  const seen = new Set<string>()
  const unique: string[] = []
  for (const p of assets) {
    if (seen.has(p)) continue
    seen.add(p)
    unique.push(p)
  }

  return { ok: errors.length === 0, errors, plan, assets: unique, version }
}

export function collectBrainCoreAssets(opts: { releaseDir: string; version: string }) {
  const { releaseDir, version } = opts
  const tarball = `pomnia-brain-core-${version}-linux-x64.tar.gz`
  const full = join(releaseDir, tarball)
  const errors: string[] = []
  const plan: AssetPlanRow[] = []
  const assets: string[] = []

  if (!existsSync(full)) {
    return { ok: true as const, present: false, errors, plan, assets }
  }

  const sha = ensureMatchingSha256({ filePath: full })
  if (!sha.ok) errors.push(sha.error)
  else {
    plan.push({ role: 'brain-tarball', path: full, note: `sha256 ${sha.hex.slice(0, 12)}...` })
    assets.push(full, sha.shaPath)
  }
  return { ok: errors.length === 0, present: true, errors, plan, assets }
}

/** Release file name for the Mini zip. Not the portable exe, and not `*-portable.zip`. */
export function miniZipFileName(version: string): string {
  if (!version || version.startsWith('v')) {
    throw new Error(`mini zip version must look like 0.1.91, got ${JSON.stringify(version)}`)
  }
  return `PomniaMini-${version}.zip`
}

/**
 * The Mini zip in `release/mini/`, plus a SHA-256 sidecar.
 *
 * Missing directory or missing zip is "not present" (a Windows-first draft may
 * not have it yet). A zip with any other name is an error — including the old
 * `PomniaMini-<version>-portable.zip`, which is the unpacker story and not the
 * download. The portable exe is never an asset.
 */
export function collectMiniAssets(opts: { releaseDir: string; version: string }) {
  const { releaseDir, version } = opts
  const name = miniZipFileName(version)
  const errors: string[] = []
  const plan: AssetPlanRow[] = []
  const assets: string[] = []

  if (!existsSync(releaseDir)) {
    return {
      ok: true as const,
      present: false,
      errors,
      plan,
      assets,
      sha256: null as string | null,
      sizeMb: null as string | null,
    }
  }

  const zips = readdirSync(releaseDir).filter((n) => n.endsWith('.zip') && !n.endsWith('.blockmap'))
  const foreign = zips.filter((n) => n !== name)
  if (foreign.length) {
    errors.push(
      `unexpected zip in ${releaseDir}: ${foreign.join(', ')} — the release asset is ${name} (unpack that; do not ship a portable zip)`,
    )
  }

  const full = join(releaseDir, name)
  if (!existsSync(full)) {
    return {
      ok: errors.length === 0,
      present: false,
      errors,
      plan,
      assets,
      sha256: null as string | null,
      sizeMb: null as string | null,
    }
  }

  const sha = ensureMatchingSha256({ filePath: full })
  if (!sha.ok) {
    errors.push(sha.error)
    return {
      ok: false as const,
      present: true,
      errors,
      plan,
      assets,
      sha256: sha.hex,
      sizeMb: null as string | null,
    }
  }

  const sizeMb = (readFileSync(full).length / 1024 / 1024).toFixed(2)
  plan.push({
    role: 'mini-zip',
    path: full,
    note: sha.wrote ? `wrote ${basename(sha.shaPath)}` : `sha256 ${sha.hex.slice(0, 12)}...`,
  })
  assets.push(full, sha.shaPath)
  return { ok: errors.length === 0, present: true, errors, plan, assets, sha256: sha.hex, sizeMb }
}

/**
 * The Mini block of a release body.
 *
 * The download is the zip. Saying "portable" here sends people to the exe that
 * unpacks into %TEMP% on every launch.
 */
export function miniNotesBlock(opts: {
  version: string
  sizeMb: string
  commit: string
  sha256: string
}): string {
  const { version, sizeMb, commit, sha256 } = opts
  return `**Pomnia Mini** · Windows zip · ${sizeMb} MB · built from \`${commit}\`

Download \`PomniaMini-${version}.zip\`, unpack it once, and run \`PomniaMini.exe\`.
That zip is the build to use. The portable \`.exe\` unpacks into \`%TEMP%\` on every launch — it is not the download.

\`\`\`powershell
Get-FileHash PomniaMini-${version}.zip -Algorithm SHA256
\`\`\`

\`\`\`
${sha256}
\`\`\``
}

/**
 * Bring the Mini line and its SHA-256 in `body` up to date, or append the
 * Mini block when the release was published without one. Only the hash that
 * follows this version's Mini Get-FileHash line is replaced. Idempotent.
 */
export function refreshMiniNotes(
  body: string,
  opts: { version: string; sizeMb: string; commit: string; sha256: string },
): string {
  const { version, sizeMb, commit, sha256 } = opts
  const line = /\*\*Pomnia Mini\*\* · Windows zip · [\d.]+ MB · built from `[0-9a-f]+`/
  if (!line.test(body)) {
    const trimmed = body.replace(/\s+$/, '')
    return `${trimmed}${trimmed ? '\n\n' : ''}${miniNotesBlock(opts)}\n`
  }
  const esc = version.replace(/\./g, '\\.')
  const hash = new RegExp(
    `(Get-FileHash PomniaMini-${esc}\\.zip -Algorithm SHA256\\r?\\n\`\`\`\\r?\\n\\r?\\n\`\`\`\\r?\\n)[0-9A-Fa-f]{64}`,
  )
  return body
    .replace(line, `**Pomnia Mini** · Windows zip · ${sizeMb} MB · built from \`${commit}\``)
    .replace(hash, `$1${sha256}`)
}

/**
 * The Windows block of a release body, as publish-release writes it.
 *
 * attach:win-release replaces the installer and its .sha256 asset, but the
 * notes carry the size, the commit and the SHA-256 as prose. Leaving them
 * stale is worse than omitting them: v0.1.91 was re-attached from a fixed
 * commit and the notes still told readers to expect the old hash, so anyone
 * verifying the download as instructed would have seen a mismatch.
 */
export function windowsNotesBlock(opts: {
  version: string
  sizeMb: string
  commit: string
  sha256: string
}): string {
  const { version, sizeMb, commit, sha256 } = opts
  return `**Windows installer** · ${sizeMb} MB · built from \`${commit}\`

This build is **not code-signed**, so Windows shows “Windows protected your PC”.
Choose **More info → Run anyway**, or verify the file first:

\`\`\`powershell
Get-FileHash Pomnia-${version}-setup.exe -Algorithm SHA256
\`\`\`

\`\`\`
${sha256}
\`\`\``
}

/**
 * Bring the Windows line and its SHA-256 in `body` up to date, or append the
 * Windows block when the release was created without one (a CI-first draft).
 * Only the hash that follows this version's Get-FileHash line is replaced, so
 * checksums quoted for other platforms are left alone. Idempotent.
 */
export function refreshWindowsNotes(
  body: string,
  opts: { version: string; sizeMb: string; commit: string; sha256: string },
): string {
  const { version, sizeMb, commit, sha256 } = opts
  const line = /\*\*Windows installer\*\* · [\d.]+ MB · built from `[0-9a-f]+`/
  if (!line.test(body)) {
    const trimmed = body.replace(/\s+$/, '')
    return `${trimmed}${trimmed ? '\n\n' : ''}${windowsNotesBlock(opts)}\n`
  }
  const esc = version.replace(/\./g, '\.')
  const hash = new RegExp(
    `(Get-FileHash Pomnia-${esc}-setup\.exe -Algorithm SHA256\r?\n\`\`\`\r?\n\r?\n\`\`\`\r?\n)[0-9A-Fa-f]{64}`,
  )
  return body
    .replace(line, `**Windows installer** · ${sizeMb} MB · built from \`${commit}\``)
    .replace(hash, `$1${sha256}`)
}
