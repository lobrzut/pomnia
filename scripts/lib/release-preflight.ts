// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ask git and GitHub whether this checkout is allowed to upload to `tag`.
 * The decision itself is guardReleaseUpload — this only gathers the facts.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { guardReleaseUpload, parseReleaseCommit, releaseCommitFileName } from './release-guard.ts'

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function preflightReleaseUpload(opts: {
  cwd: string
  tag: string
  version: string
}): { ok: true; head: string } | { ok: false; error: string } {
  const porcelain = git(opts.cwd, ['status', '--porcelain']) ?? ''
  const head = git(opts.cwd, ['rev-parse', 'HEAD']) ?? ''
  const tagCommit = git(opts.cwd, ['rev-parse', `${opts.tag}^{commit}`])

  let releaseExists = false
  let isDraft = false
  let targetCommitish: string | null = null
  let recordedCommit: string | null = null

  try {
    const raw = execFileSync(
      'gh',
      ['release', 'view', opts.tag, '--json', 'isDraft,targetCommitish,assets'],
      { cwd: opts.cwd, encoding: 'utf8' },
    )
    const view = JSON.parse(raw) as {
      isDraft?: boolean
      targetCommitish?: string
      assets?: { name: string }[]
    }
    releaseExists = true
    isDraft = view.isDraft === true
    targetCommitish = view.targetCommitish ?? null
    const commitName = releaseCommitFileName(opts.version)
    if ((view.assets ?? []).some((a) => a.name === commitName)) {
      const dir = mkdtempSync(join(tmpdir(), 'pomnia-commit-'))
      try {
        execFileSync('gh', ['release', 'download', opts.tag, '--pattern', commitName, '--dir', dir, '--clobber'], {
          cwd: opts.cwd,
        })
        recordedCommit = parseReleaseCommit(readFileSync(join(dir, commitName), 'utf8'))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  } catch {
    releaseExists = false
  }

  const verdict = guardReleaseUpload({
    head,
    tagCommit,
    dirty: porcelain ? porcelain : null,
    releaseExists,
    isDraft,
    targetCommitish,
    recordedCommit,
  })
  if (!verdict.ok) return verdict
  return { ok: true, head }
}
