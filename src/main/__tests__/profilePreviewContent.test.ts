import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let vaultDir = ''

vi.mock('../brainCore.js', () => ({
  brainCore: { status: () => ({ running: true }) },
}))

vi.mock('../brainPaths.js', () => ({
  getOpenEncryptedVaultPath: vi.fn(() => vaultDir || null),
  brainVaultRoot: vi.fn(() => vaultDir),
  brainVaultDistilledDir: vi.fn(() => join(vaultDir, 'distilled')),
}))

vi.mock('../ollamaSettings.js', () => ({
  resolveOllamaUrl: () => 'http://127.0.0.1:11434',
}))

vi.mock('@core/brain/ollama.js', () => ({
  defaultOllamaConfig: () => ({ baseUrl: 'http://127.0.0.1:11434', chatModel: 'qwen2.5:14b' }),
  Ollama: class {
    async reachable() {
      return false
    }
    async generate() {
      return ''
    }
  },
}))

vi.mock('@core/brain/localIndex.js', () => ({
  loadIndex: async () => ({ entries: [] }),
  searchIndex: async () => [],
}))

vi.mock('@core/log.js', () => ({
  log: { warn: () => {}, info: () => {} },
}))

describe('profile identity helpers', () => {
  beforeEach(() => {
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-pp-id-'))
  })

  afterEach(() => {
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true })
    vaultDir = ''
  })

  it('detects empty vs filled § PROFIL', async () => {
    const { hasIdentityProfile } = await import('../profilePreviewContent.js')
    expect(hasIdentityProfile('§ TECH\nfoo\n')).toBe(false)
    expect(hasIdentityProfile('§ PROFIL\n· Imię / nick:\n')).toBe(false)
    expect(hasIdentityProfile('§ PROFIL\n· alice — PL developer\n')).toBe(true)
  })

  it('flags trading/Pine notes as noise', async () => {
    const { isNoiseNote } = await import('../profilePreviewContent.js')
    expect(isNoiseNote('pine-atr', 'Pine Script strategy ATR stop RSI futures')).toBe(true)
    expect(isNoiseNote('pomnia-decyzje', 'Preferencje: agent najpierw search_library, UI PL')).toBe(false)
  })

  it('flags ship/changelog notes as noise', async () => {
    const { isNoiseNote } = await import('../profilePreviewContent.js')
    expect(isNoiseNote('ship', 'next ship 0.1.22 installer pack:win changelog')).toBe(true)
  })

  it('skips low quality_score / garbage frontmatter', async () => {
    const { isLowQualityNote, parseNoteQuality, scoreIdentitySignal } = await import(
      '../profilePreviewContent.js'
    )
    const garbage = `---
quality: garbage
quality_score: 3.2
---
# note
Preferencje: ownership vault
`
    expect(isLowQualityNote(garbage)).toBe(true)
    expect(parseNoteQuality(garbage).qualityScore).toBe(3.2)
    const ok = `---
quality: ok
quality_score: 7.1
---
# note
threat MIT wrapper; irytanty glow; tempo product-owner
`
    expect(isLowQualityNote(ok)).toBe(false)
    expect(scoreIdentitySignal('id', 'threat MIT irytant tempo ownership', 7.1)).toBeGreaterThan(5)
  })

  it('fallback asks to fill § PROFIL when only TECH exists', async () => {
    const { promises: fsp, mkdirSync } = await import('node:fs')
    mkdirSync(join(vaultDir, 'distilled'), { recursive: true })
    await fsp.writeFile(
      join(vaultDir, 'USER.md'),
      '§ TECH\nPomnia Desktop next ship 0.1.14 with themes and pip.\n',
      'utf8',
    )
    const { buildProfilePreview } = await import('../profilePreviewContent.js')
    const r = await buildProfilePreview()
    expect(r.status).toBe('ok')
    expect(r.summary).toMatch(/§ PROFIL|Za mało o Tobie/i)
    expect(r.summary).not.toMatch(/Pine|ATR|RSI/i)
  })
})

describe('buildProfilePreview', () => {
  beforeEach(() => {
    vi.resetModules()
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-pp-'))
  })

  afterEach(() => {
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true })
    vaultDir = ''
  })

  it('returns vault_locked when no encrypted vault is open', async () => {
    const { getOpenEncryptedVaultPath } = await import('../brainPaths.js')
    vi.mocked(getOpenEncryptedVaultPath).mockReturnValue(null)
    const { buildProfilePreview } = await import('../profilePreviewContent.js')
    const r = await buildProfilePreview()
    expect(r).toEqual({ status: 'vault_locked' })
  })
})

describe('saveProfileUserMd', () => {
  beforeEach(() => {
    vi.resetModules()
    vaultDir = mkdtempSync(join(tmpdir(), 'pomnia-pp-save-'))
  })

  afterEach(() => {
    if (vaultDir) rmSync(vaultDir, { recursive: true, force: true })
    vaultDir = ''
  })

  it('refuses write when vault is locked', async () => {
    const { getOpenEncryptedVaultPath } = await import('../brainPaths.js')
    vi.mocked(getOpenEncryptedVaultPath).mockReturnValue(null)
    const { saveProfileUserMd } = await import('../profilePreviewContent.js')
    const r = await saveProfileUserMd('§ PROFIL\nx\n')
    expect(r).toEqual({ ok: false, error: 'vault_locked' })
  })

  it('writes USER.md into the open vault root', async () => {
    const { getOpenEncryptedVaultPath, brainVaultRoot } = await import('../brainPaths.js')
    vi.mocked(getOpenEncryptedVaultPath).mockReturnValue(vaultDir)
    vi.mocked(brainVaultRoot).mockReturnValue(vaultDir)
    const { saveProfileUserMd } = await import('../profilePreviewContent.js')
    const body = '§ PROFIL\nName: Test User\n'
    const r = await saveProfileUserMd(body)
    expect(r).toEqual({ ok: true, path: join(vaultDir, 'USER.md'), chars: body.length })
    expect(readFileSync(join(vaultDir, 'USER.md'), 'utf8')).toBe(body)
  })

  it('rejects content over the char limit', async () => {
    const { getOpenEncryptedVaultPath, brainVaultRoot } = await import('../brainPaths.js')
    vi.mocked(getOpenEncryptedVaultPath).mockReturnValue(vaultDir)
    vi.mocked(brainVaultRoot).mockReturnValue(vaultDir)
    const { saveProfileUserMd, USER_MAX_CHARS } = await import('../profilePreviewContent.js')
    const r = await saveProfileUserMd('x'.repeat(USER_MAX_CHARS + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('too_long')
  })
})
