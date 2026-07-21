import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/pomnia-test' },
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

  it('floatingMonitorOnMinimize defaults on', async () => {
    const mod = await import('../appSettings.js')
    expect(mod.getAppSettings().floatingMonitorOnMinimize).toBe(true)
    await mod.setAppSettings({ floatingMonitorOnMinimize: false })
    expect(mod.getAppSettings().floatingMonitorOnMinimize).toBe(false)
  })

  it('floatingMonitorAlwaysOnTop defaults on', async () => {
    const mod = await import('../appSettings.js')
    expect(mod.getAppSettings().floatingMonitorAlwaysOnTop).toBe(true)
    await mod.setAppSettings({ floatingMonitorAlwaysOnTop: false })
    expect(mod.getAppSettings().floatingMonitorAlwaysOnTop).toBe(false)
  })

  it('persists per-user brain settings', async () => {
    const mod = await import('../appSettings.js')
    await mod.setAppSettings({
      ollamaUrl: 'http://127.0.0.1:11434',
      brainMcpUrl: 'http://brain.example.local:7862',
      brainDeployUrl: 'http://brain.example.local:7860',
      brainTarget: 'remote',
      connectToken: 'btk_test',
    })
    const s = mod.getAppSettings()
    expect(s.ollamaUrl).toBe('http://127.0.0.1:11434')
    expect(s.brainMcpUrl).toBe('http://brain.example.local:7862')
    expect(s.brainDeployUrl).toBe('http://brain.example.local:7860')
    expect(s.brainTarget).toBe('remote')
    expect(s.connectToken).toBe('btk_test')
  })
})
