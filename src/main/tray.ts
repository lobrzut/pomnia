// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * System tray — keeps Pomnia alive (embedded brain MCP) when the window is hidden.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { isEnLocale, m } from './mainStrings.js'
import { app, Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import { activity } from './activity.js'
import { brainCore } from './brainCore.js'
import { isFloatingMonitorVisible, toggleFloatingMonitor } from './floatingMonitor.js'
import { showProfilePreview } from './profilePreview.js'

let tray: Tray | null = null

async function resolveIcon(): Promise<NativeImage> {
  const candidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(app.getAppPath(), 'resources', 'icon.ico'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    }
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
  const icon = await resolveIcon()
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
