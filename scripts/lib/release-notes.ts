// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Release notes are a UTF-8 file, never a `--notes` argument.
 *
 * Passing the body on the command line is how v0.1.91's notes were
 * double-encoded (em-dash became "ÔÇö"): Windows handed gh a string in the
 * console code page. `--notes-file` reads the bytes we wrote.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseReleaseCommit } from './release-guard.ts'
import { STABLE_MINI_LINUX_APPIMAGE, STABLE_MINI_WIN_ZIP, parseSha256Line, versionFromTag } from './release-assets.ts'

export function writeReleaseNotesFile(path: string, body: string): void {
  const text = body.endsWith('\n') ? body : `${body}\n`
  writeFileSync(path, text, { encoding: 'utf8' })
}

export function composeReleaseNotes(opts: {
  version: string
  tag: string
  commit: string
  digests: { file: string; sha256: string }[]
}): string {
  const rows = [...opts.digests]
    .map((d) => ({ file: d.file, sha256: d.sha256.toLowerCase() }))
    .sort((a, b) => a.file.localeCompare(b.file))
  const listing = rows.map((r) => `${r.sha256}  ${r.file}`).join('\n')
  const stableWin = rows.some((r) => r.file === STABLE_MINI_WIN_ZIP)
  const stableLinux = rows.some((r) => r.file === STABLE_MINI_LINUX_APPIMAGE)

  return `Pomnia ${opts.version}

Every file in this release was built from commit \`${opts.commit}\`, the commit tag \`${opts.tag}\` points at. A later commit does not replace these files — that is a new version.

This build is **not code-signed** — Windows shows “Windows protected your PC”. Choose More info → Run anyway, or compare the download with the digest below.

**Windows installer:** \`Pomnia-${opts.version}-setup.exe\`

**Pomnia Mini (Windows)** keeps a stable name, so a link survives the next release: \`${STABLE_MINI_WIN_ZIP}\`${stableWin ? '' : ' (not attached yet)'}. The versioned zip is \`PomniaMini-${opts.version}.zip\`. Unpack either one once and run \`PomniaMini.exe\`. The portable exe is not the download.

**Pomnia Mini (Linux):** \`${STABLE_MINI_LINUX_APPIMAGE}\`${stableLinux ? '' : ' ships with the Mini Linux pack and is not in this release until that asset is attached'}.

**Linux desktop:** \`Pomnia-${opts.version}.AppImage\` and the \`.deb\`. **macOS:** \`Pomnia-${opts.version}-arm64.dmg\` and \`Pomnia-${opts.version}-x64.dmg\`. **Server:** \`pomnia-brain-core-${opts.version}-linux-x64.tar.gz\`.

## SHA-256

\`\`\`
${listing}
\`\`\`
`
}

/**
 * Replace the release body with the digest list of whatever is on the tag.
 * Call after the upload, so the sidecars just attached are included.
 */
export function rewriteReleaseNotes(opts: { cwd: string; tag: string }): void {
  const dir = mkdtempSync(join(tmpdir(), 'pomnia-notes-'))
  try {
    execFileSync('gh', ['release', 'download', opts.tag, '--pattern', '*.sha256', '--dir', dir, '--clobber'], {
      cwd: opts.cwd,
    })
    execFileSync('gh', ['release', 'download', opts.tag, '--pattern', '*.commit', '--dir', dir, '--clobber'], {
      cwd: opts.cwd,
    })
    const digests: { file: string; sha256: string }[] = []
    let commit = ''
    for (const name of readdirSync(dir)) {
      const body = readFileSync(join(dir, name), 'utf8')
      if (name.endsWith('.sha256')) {
        const parsed = parseSha256Line(body)
        if (parsed) digests.push({ file: parsed.fileName, sha256: parsed.hex })
      } else if (name.endsWith('.commit')) {
        commit = parseReleaseCommit(body) ?? ''
      }
    }
    if (!commit) throw new Error(`${opts.tag} has no pomnia-*.commit asset`)
    if (digests.length === 0) throw new Error(`${opts.tag} has no SHA-256 sidecars`)
    const notesFile = join(dir, 'notes.md')
    writeReleaseNotesFile(
      notesFile,
      composeReleaseNotes({ version: versionFromTag(opts.tag), tag: opts.tag, commit, digests }),
    )
    execFileSync('gh', ['release', 'edit', opts.tag, '--notes-file', notesFile], { cwd: opts.cwd, stdio: 'inherit' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
