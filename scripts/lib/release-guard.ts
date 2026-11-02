// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * A release is one tagged commit.
 *
 * v0.1.91 was tagged at one commit and then had its Windows installer and Mini
 * zip replaced from a later one, after the release was already public. The tag
 * still pointed at the old commit. These checks refuse that: upload only from
 * the commit the tag names, and never replace assets on a release that has
 * already been published.
 */

const FULL_SHA = /^[0-9a-f]{40}$/

export function releaseCommitFileName(version: string): string {
  if (!version || version.startsWith('v')) {
    throw new Error(`version must look like 0.1.91, got ${JSON.stringify(version)}`)
  }
  return `pomnia-${version}.commit`
}

export function parseReleaseCommit(body: string): string | null {
  const line = body.trim().split(/\r?\n/)[0] ?? ''
  return FULL_SHA.test(line) ? line : null
}

export function formatReleaseCommit(sha: string): string {
  if (!FULL_SHA.test(sha)) {
    throw new Error(`commit must be 40 lowercase hex characters, got ${JSON.stringify(sha)}`)
  }
  return `${sha}\n`
}

export function guardReleaseUpload(input: {
  head: string
  /** `tag^{commit}`, or null when the tag does not exist yet. */
  tagCommit: string | null
  /** First line of `git status --porcelain`, or null when the tree is clean. */
  dirty: string | null
  releaseExists: boolean
  isDraft: boolean
  /** GitHub `targetCommitish`. A 40-hex value is compared; a branch name is not. */
  targetCommitish: string | null
  /** Contents of `pomnia-<version>.commit` already on the release, if any. */
  recordedCommit: string | null
}): { ok: true } | { ok: false; error: string } {
  if (input.dirty) {
    return {
      ok: false,
      error: `working tree is dirty (${input.dirty.split('\n')[0]}) — the release has to match a commit`,
    }
  }
  if (!FULL_SHA.test(input.head)) {
    return {
      ok: false,
      error: `HEAD must be the full lowercase commit, got ${JSON.stringify(input.head)}`,
    }
  }
  if (input.tagCommit && input.tagCommit !== input.head) {
    return {
      ok: false,
      error:
        `this checkout is ${input.head}, but the tag points at ${input.tagCommit}. ` +
        'Build and upload from the tagged commit; a later commit is a new version.',
    }
  }
  if (!input.releaseExists) return { ok: true }
  if (!input.isDraft) {
    return {
      ok: false,
      error:
        'this release is already published. Its assets stay as they were — replacing them is how v0.1.91 shipped bytes from a different commit than its tag. Cut the next version.',
    }
  }
  if (input.recordedCommit && input.recordedCommit !== input.head) {
    return {
      ok: false,
      error: `the release was recorded from ${input.recordedCommit}; this checkout is ${input.head}`,
    }
  }
  const target = input.targetCommitish ?? ''
  if (FULL_SHA.test(target) && target !== input.head) {
    return {
      ok: false,
      error: `the release target commit is ${target}; this checkout is ${input.head}`,
    }
  }
  return { ok: true }
}
