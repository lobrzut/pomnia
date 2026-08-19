// SPDX-License-Identifier: AGPL-3.0-only
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getAppPath: () => '/tmp/app', getFileIcon: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  Tray: class {},
  nativeImage: { createFromPath: vi.fn(), createEmpty: vi.fn() },
}))

vi.mock('../activity.js', () => ({ activity: { menuLine: () => null, tooltip: () => '' } }))
vi.mock('../brainCore.js', () => ({ brainCore: { status: () => ({}) } }))
vi.mock('../floatingMonitor.js', () => ({ isFloatingMonitorVisible: () => false, toggleFloatingMonitor: vi.fn() }))
vi.mock('../profilePreview.js', () => ({ showProfilePreview: vi.fn() }))
vi.mock('../mainStrings.js', () => ({ isEnLocale: () => false, m: () => ({}) }))
vi.mock('@core/log.js', () => ({ log: { warn: vi.fn(), info: vi.fn() } }))

import { pickTrayPath, trayFileNames } from '../tray.js'

describe('darwin tray icon resolution', () => {
  it('looks for color brand PNGs, not Template or icon.ico', () => {
    expect(trayFileNames('darwin')).toEqual(['trayIcon.png'])
    expect(trayFileNames('darwin')).not.toContain('icon.ico')
    expect(trayFileNames('darwin')).not.toContain('trayTemplate.png')
  })

  // join() follows the host, not the platform argument, so on Windows a
  // darwin-shaped literal like '/App/.../trayIcon.png' never matches what the
  // function builds. Build the fixtures with the same join and the assertion
  // is about which candidate wins, which is what it was always testing.
  const RES = join('/App', 'Contents', 'Resources')
  const TRAY = join(RES, 'trayIcon.png')

  it('picks extraResources path outside asar', () => {
    const exists = (p: string) => p === TRAY
    expect(pickTrayPath('darwin', RES, join(RES, 'app.asar'), exists)).toBe(TRAY)
  })

  it('skips a tray PNG packed inside asar', () => {
    const exists = (p: string) => p.includes('.asar') && p.endsWith('trayIcon.png')
    expect(pickTrayPath('darwin', '/App/Contents/Resources', '/App/Contents/Resources/app.asar', exists)).toBeUndefined()
  })

  it('does not use getFileIcon fallback path (icon.ico) on darwin', () => {
    const exists = (p: string) => p.endsWith('icon.ico')
    expect(pickTrayPath('darwin', '/App/Contents/Resources', '/tmp/app', exists)).toBeUndefined()
  })
})
