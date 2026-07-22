import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataPath = join(tmpdir(), 'pomnia-portable-userdata-default')

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => userDataPath,
    getAppPath: () => '/tmp/pomnia-app',
  },
}))

describe('portable vault knowledge', () => {
  let vaultDir = ''
  let userData = ''

  beforeEach(async () => {
    userData = mkdtempSync(join(tmpdir(), 'pomnia-ud-'))
    userDataPath = userData
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-enc-vault-'))
    const { setOpenEncryptedVaultPath } = await import('../brainPaths.js')
    setOpenEncryptedVaultPath(null)
  })

  afterEach(async () => {
    const { setOpenEncryptedVaultPath } = await import('../brainPaths.js')
    setOpenEncryptedVaultPath(null)
    for (const d of [vaultDir, userData]) {
      try {
        rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('brainVaultRoot prefers open encrypted vault folder', async () => {
    const {
      brainVaultRoot,
      brainVaultLegacyRoot,
      setOpenEncryptedVaultPath,
      brainVaultDistilledDir,
    } = await import('../brainPaths.js')

    expect(brainVaultRoot()).toBe(brainVaultLegacyRoot())
    setOpenEncryptedVaultPath(vaultDir)
    expect(brainVaultRoot()).toBe(vaultDir)
    expect(brainVaultDistilledDir()).toBe(join(vaultDir, 'distilled'))
    setOpenEncryptedVaultPath(null)
    expect(brainVaultRoot()).toBe(brainVaultLegacyRoot())
  })

  it('migrates USER.md + distilled + sessions once from AppData', async () => {
    const legacyRoot = join(userData, 'brain-core-data', 'vault')
    mkdirSync(join(legacyRoot, 'distilled'), { recursive: true })
    mkdirSync(join(legacyRoot, 'sessions'), { recursive: true })
    writeFileSync(join(legacyRoot, 'USER.md'), '§ user\nName: Test\n')
    writeFileSync(join(legacyRoot, 'distilled', 'a.md'), 'note a')
    writeFileSync(join(legacyRoot, 'sessions', 's.md'), 'session')

    const { ensurePortableKnowledge } = await import('../ensurePortableKnowledge.js')
    const root = await ensurePortableKnowledge(vaultDir)

    expect(root).toBe(vaultDir)
    expect(readFileSync(join(vaultDir, 'USER.md'), 'utf8')).toContain('Name: Test')
    expect(readFileSync(join(vaultDir, 'distilled', 'a.md'), 'utf8')).toBe('note a')
    expect(readFileSync(join(vaultDir, 'sessions', 's.md'), 'utf8')).toBe('session')
    expect(existsSync(join(vaultDir, '.portable-knowledge'))).toBe(true)
    // AppData backup untouched
    expect(readFileSync(join(legacyRoot, 'USER.md'), 'utf8')).toContain('Name: Test')

    // Second open must not overwrite portable with stale legacy
    writeFileSync(join(legacyRoot, 'USER.md'), '§ user\nName: Stale\n')
    writeFileSync(join(vaultDir, 'USER.md'), '§ user\nName: Portable\n')
    await ensurePortableKnowledge(vaultDir)
    expect(readFileSync(join(vaultDir, 'USER.md'), 'utf8')).toContain('Portable')
  })

  it('writes migrate marker when legacy is empty so reopen skips remigrate', async () => {
    const { ensurePortableKnowledge } = await import('../ensurePortableKnowledge.js')
    const { portableKnowledgePresent } = await import('../brainPaths.js')

    await ensurePortableKnowledge(vaultDir)
    expect(portableKnowledgePresent(vaultDir)).toBe(true)
    expect(existsSync(join(vaultDir, '.portable-knowledge'))).toBe(true)
  })
})
