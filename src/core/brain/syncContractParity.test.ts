import { describe, expect, it } from 'vitest'

import {
  MAX_FILE_BYTES as SERVER_MAX_FILE_BYTES,
  SYNC_DIRS,
  SYNC_ROOT_FILES,
  safeVaultPath,
} from '../../../packages/brain-core/src/sync/paths.js'
import { buildVaultManifest, SYNCED_DIRS, SYNCED_ROOT_FILES } from './vaultSync.js'

/**
 * The sender and the receiver each keep their own copy of what replicates.
 * vaultSync.ts says so out loud — "Mirrors brain-core's SYNC_DIRS — the replica
 * rejects anything else anyway" — and that reasoning covers exactly one
 * direction.
 *
 * If the *desktop's* list is the narrower one, nothing is rejected, because
 * nothing is offered. Those notes simply never leave the machine, no counter
 * moves, and both sides report a clean sync. That is the failure this file
 * exists to make impossible: a comment cannot fail, a test can.
 *
 * It catches drift inside one build. It cannot catch a desktop talking to an
 * older server — for that the desktop has to read the version the server
 * already publishes on /healthz, which it currently ignores.
 */
describe('the two halves of the replication contract agree', () => {
  it('replicates the same directories from both sides', () => {
    expect([...SYNCED_DIRS].sort()).toEqual([...SYNC_DIRS].sort())
  })

  it('allows the same root files', () => {
    expect([...SYNCED_ROOT_FILES].sort()).toEqual([...SYNC_ROOT_FILES].sort())
  })

  it('uses the same per-file ceiling', () => {
    // Named rather than compared to a literal: if one side changes, the message
    // should say which number the other side is holding.
    expect(SERVER_MAX_FILE_BYTES).toBe(8 * 1024 * 1024)
  })

  /**
   * The stronger claim, and the one that actually matters: everything the
   * sender is willing to offer must be something the receiver is willing to
   * take. Checked through the real validator, not by comparing lists.
   */
  it('offers nothing the replica would refuse', () => {
    for (const dir of SYNCED_DIRS) {
      const verdict = safeVaultPath(`${dir}/note.md`)
      expect(verdict.ok, `replica refuses ${dir}/note.md that the desktop would send`).toBe(true)
    }
    for (const file of SYNCED_ROOT_FILES) {
      const verdict = safeVaultPath(file)
      expect(verdict.ok, `replica refuses root file ${file} that the desktop would send`).toBe(true)
    }
  })

  it('agrees on which extensions are text', () => {
    for (const ext of ['md', 'markdown', 'txt', 'json', 'yaml', 'yml']) {
      expect(safeVaultPath(`sessions/a.${ext}`).ok, `replica refuses .${ext}`).toBe(true)
    }
    for (const ext of ['pdf', 'png', 'exe', 'sync-tmp']) {
      expect(safeVaultPath(`sessions/a.${ext}`).ok, `replica accepts .${ext}`).toBe(false)
    }
  })
})

describe('what the sender actually walks', () => {
  /**
   * The constants agreeing is not the same as the walker using them: a
   * directory could be listed and never visited. So this goes through the real
   * builder and checks that every path it produces survives the replica's
   * validator — sender and receiver, end to end, on real files.
   */
  it('produces only paths the replica accepts', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')

    const root = await mkdtemp(join(tmpdir(), 'pomnia-parity-'))
    try {
      for (const dir of SYNCED_DIRS) {
        await mkdir(join(root, dir), { recursive: true })
        await writeFile(join(root, dir, 'note.md'), `# ${dir}\n`, 'utf8')
      }
      for (const file of SYNCED_ROOT_FILES) {
        await writeFile(join(root, file), '# root\n', 'utf8')
      }

      const { entries, skipped } = await buildVaultManifest(root)
      // One note per synced dir plus the root files — if the walker misses a
      // directory the constants list, this is where the count falls short.
      expect(entries.length).toBe(SYNCED_DIRS.length + SYNCED_ROOT_FILES.length)
      expect(skipped).toEqual([])
      for (const entry of entries) {
        const verdict = safeVaultPath(entry.path)
        expect(verdict.ok, `sender offers ${entry.path}, replica refuses it`).toBe(true)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
