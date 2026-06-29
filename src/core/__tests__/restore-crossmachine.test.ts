/**
 * End-to-end proof of the "backup on one machine, restore on another" promise.
 * We craft a snapshot whose ORIGIN is a foreign machine (different user/home,
 * Windows) and restore it onto the current machine, then assert on the bytes
 * actually written to disk: config paths rewritten, Claude Code project dir renamed.
 */
import { describe, expect, it, afterAll } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Vault, type FileSource } from '../vault.js'
import { applyRestore } from '../restore.js'
import { encodeClaudeProject } from '../pathmap.js'
import { currentOS, homeDir, userName } from '../platform.js'
import type { Snapshot } from '../model.js'

const tmpDirs: string[] = []
afterAll(async () => {
  for (const d of tmpDirs) await fs.rm(d, { recursive: true, force: true })
})

describe('cross-machine restore (e2e)', () => {
  it('remaps config contents and Claude Code project dirs from a foreign origin', async () => {
    // Skip the (impossible) case where the test runner literally runs as "alice".
    if (userName() === 'alice') return

    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'continuum-xm-'))
    tmpDirs.push(root)
    const vault = await Vault.create(path.join(root, 'v.continuum'), 'XM', 'pw')

    const originHome = 'C:\\Users\\Alice'
    const settings = 'home=C:\\Users\\Alice\\.claude; fwd=C:/Users/Alice/x; json="C:\\\\Users\\\\Alice\\\\y"'
    const projectDir = encodeClaudeProject('C:\\Users\\Alice\\PROJEKTY') // C--Users-Alice-PROJEKTY

    const files: FileSource[] = [
      { item: { relPath: 'settings.json', absRoot: originHome, pathSensitive: true }, read: async () => Buffer.from(settings) },
      { item: { relPath: `projects/${projectDir}/sess.jsonl`, absRoot: originHome, pathSensitive: false }, read: async () => Buffer.from('{"type":"user"}') }
    ]
    const meta: Snapshot = {
      id: 'xm-1',
      createdAt: new Date().toISOString(),
      source: { id: 'claude-code', label: 'Claude Code', strategy: 'hybrid', root: `${originHome}\\.claude`, os: 'win32' },
      origin: { host: 'WIN-OTHER', user: 'alice', home: originHome },
      stats: { conversations: 0, messages: 0, files: 0, bytes: 0 }
    }
    await vault.addSnapshot(meta, [], files)

    const target = path.join(root, 'restored')
    const res = await applyRestore(vault, { snapshotId: 'xm-1', targetRoot: target, overwrite: true, remapPaths: true })
    expect(res.written).toBe(2)
    expect(res.remapped).toBeGreaterThanOrEqual(1)

    // 1) Claude Code project dir was renamed to THIS machine's home encoding.
    const expectedDir = encodeClaudeProject(path.join(homeDir(), 'PROJEKTY')).replace(/[/\\:]/g, '-')
    const restoredJsonl = path.join(target, 'projects', expectedDir, 'sess.jsonl')
    expect(await fs.access(restoredJsonl).then(() => true).catch(() => false)).toBe(true)

    // 2) settings.json content no longer references the foreign user, now references ours.
    const restoredSettings = await fs.readFile(path.join(target, 'settings.json'), 'utf8')
    expect(restoredSettings).not.toContain('alice')
    expect(restoredSettings.toLowerCase()).toContain(userName().toLowerCase())

    // Sanity: this only proves remap when origin home differs from target.
    expect(homeDir()).not.toBe(originHome)
  })
})
