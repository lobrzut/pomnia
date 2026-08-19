// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * System tray — keeps Pomnia alive (embedded brain MCP) when the window is hidden.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { log } from '@core/log.js'
import { isEnLocale, m } from './mainStrings.js'
import { app, Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import { activity } from './activity.js'
import { brainCore } from './brainCore.js'
import { isFloatingMonitorVisible, toggleFloatingMonitor } from './floatingMonitor.js'
import { showProfilePreview } from './profilePreview.js'

let tray: Tray | null = null

/** Filenames tried in order. Darwin uses a color brand PNG outside asar (not Template). */
export function trayFileNames(platform: NodeJS.Platform): string[] {
  return platform === 'darwin'
    ? ['trayIcon.png']
    : ['icon.ico', 'icon.png', 'trayIcon.png']
}

export function traySearchDirs(resourcesPath: string, appPath: string): string[] {
  return [
    resourcesPath,
    join(appPath, 'resources'),
    join(appPath, '..', '..', 'resources'),
  ]
}

/**
 * First existing candidate. Darwin skips asar paths so Electron can load
 * trayIcon@2x.png next to the 1x file from the filesystem.
 */
export function pickTrayPath(
  platform: NodeJS.Platform,
  resourcesPath: string,
  appPath: string,
  exists: (p: string) => boolean = existsSync,
): string | undefined {
  for (const name of trayFileNames(platform)) {
    for (const dir of traySearchDirs(resourcesPath, appPath)) {
      const p = join(dir, name)
      if (!exists(p)) continue
      if (platform === 'darwin' && p.includes('.asar')) continue
      return p
    }
  }
  return undefined
}

/**
 * macOS menu bar: full-color trayIcon.png from extraResources (filesystem path).
 * Do not mark it as a Template image — that turns the brand mark into a blob.
 * Color ICO / getFileIcon on darwin becomes an empty NativeImage → Electron's
 * generic `[...]` placeholder.
 */
function resolveTrayImage(): string | NativeImage {
  const p = pickTrayPath(process.platform, process.resourcesPath, app.getAppPath())
  if (p) {
    if (process.platform === 'darwin') return p
    const img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) return img
  }
  if (process.platform === 'darwin') {
    return nativeImage.createEmpty()
  }
  return app.getFileIcon(process.execPath, { size: 'small' })
}

function brainStatusLabel(): string {
  const s = brainCore.status()
  if (s.starting) return m().trayBrainStarting
  if (s.running) return m().trayBrainRunning(s.url ?? '127.0.0.1:7862')
  if (s.lastError) return m().trayBrainStoppedWith(s.lastError)
  return m().trayBrainStopped
}

function buildMenu(win: BrowserWindow | null, onQuit: () => void): Menu {
  const embedded = brainCore.status()
  const busyLine = activity.menuLine(isEnLocale())
  return Menu.buildFromTemplate([
    {
      label: m().trayOpen,
      click: () => {
        win?.show()
        win?.focus()
      },
    },
    {
      label: m().trayFloatingMonitor,
      type: 'checkbox',
      checked: isFloatingMonitorVisible(),
      click: () => {
        void toggleFloatingMonitor().then(() => tray?.setContextMenu(buildMenu(win, onQuit)))
      },
    },
    {
      label: m().trayProfile,
      click: () => {
        void showProfilePreview().then(() => tray?.setContextMenu(buildMenu(win, onQuit)))
      },
    },
    { type: 'separator' },
    ...(busyLine
      ? [
          {
            label: busyLine,
            enabled: false,
          } as const,
        ]
      : []),
    {
      label: brainStatusLabel(),
      enabled: false,
    },
    ...(embedded.running
      ? [
          {
            label: embedded.indexing
              ? m().trayStopBrainCancelIndex
              : m().trayStopBrain,
            click: () => {
              void brainCore.stop().then(() => tray?.setContextMenu(buildMenu(win, onQuit)))
            },
          } as const,
        ]
      : []),
    { type: 'separator' },
    {
      label: m().trayQuit,
      click: onQuit,
    },
  ])
}

export function refreshTrayTooltip(): void {
  tray?.setToolTip(activity.tooltip(isEnLocale()))
}

export async function initTray(win: BrowserWindow, onQuit: () => void): Promise<void> {
  if (tray) return
  const icon = resolveTrayImage()
  if (process.platform === 'darwin' && typeof icon !== 'string') {
    log.warn('darwin tray: trayIcon.png not found outside asar — menu bar will show Electron placeholder')
  }
  tray = new Tray(icon)
  refreshTrayTooltip()
  tray.setContextMenu(buildMenu(win, onQuit))
  tray.on('double-click', () => {
    win.show()
    win.focus()
  })
  // Refresh status label when the menu opens (cheap — no polling).
  tray.on('right-click', () => tray?.setContextMenu(buildMenu(win, onQuit)))
}

export function refreshTrayMenu(win: BrowserWindow | null, onQuit: () => void): void {
  refreshTrayTooltip()
  tray?.setContextMenu(buildMenu(win, onQuit))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
