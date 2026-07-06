import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/reliqua-test' },
}))

vi.mock('node:fs', () => ({
  promises: {
    readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('appSettings tray logic', () => {
  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../appSettings.js')
    await mod.loadAppSettings()
  })

  it('always hides on close while embedded brain runs', async () => {
    const mod = await import('../appSettings.js')
    await mod.setAppSettings({ closeToTray: false })
    expect(mod.shouldHideOnClose(true)).toBe(true)
  })

  it('respects closeToTray when embedded brain is off', async () => {
    const mod = await import('../appSettings.js')
    await mod.setAppSettings({ closeToTray: true })
    expect(mod.shouldHideOnClose(false)).toBe(true)
    await mod.setAppSettings({ closeToTray: false })
    expect(mod.shouldHideOnClose(false)).toBe(false)
  })

  it('minimizeToTray defaults off', async () => {
    const mod = await import('../appSettings.js')
    expect(mod.shouldHideOnMinimize()).toBe(false)
    await mod.setAppSettings({ minimizeToTray: true })
    expect(mod.shouldHideOnMinimize()).toBe(true)
  })
})
