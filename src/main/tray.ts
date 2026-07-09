/**
 * System tray — keeps Pomnia alive (embedded brain MCP) when the window is hidden.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, Menu, Tray, nativeImage, type BrowserWindow, type NativeImage } from 'electron'
import { activity } from './activity.js'
import { brainCore } from './brainCore.js'
import { isFloatingMonitorVisible, toggleFloatingMonitor } from './floatingMonitor.js'

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
  if (s.starting) return 'Lokalna wyszukiwarka: uruchamianie…'
  if (s.running) return `Lokalna wyszukiwarka: działa (${s.url ?? '127.0.0.1:7862'})`
  if (s.lastError) return `Lokalna wyszukiwarka: zatrzymana (${s.lastError})`
  return 'Lokalna wyszukiwarka: zatrzymana'
}

function buildMenu(win: BrowserWindow | null, onQuit: () => void): Menu {
  const embedded = brainCore.status()
  const busyLine = activity.menuLine()
  return Menu.buildFromTemplate([
    {
      label: 'Otwórz Pomnię',
      click: () => {
        win?.show()
        win?.focus()
      },
    },
    {
      label: 'Pływający diagram',
      type: 'checkbox',
      checked: isFloatingMonitorVisible(),
      click: () => {
        void toggleFloatingMonitor().then(() => tray?.setContextMenu(buildMenu(win, onQuit)))
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
            label: 'Zatrzymaj lokalną wyszukiwarkę',
            click: () => {
              void brainCore.stop().then(() => tray?.setContextMenu(buildMenu(win, onQuit)))
            },
          } as const,
        ]
      : []),
    { type: 'separator' },
    {
      label: 'Zakończ',
      click: onQuit,
    },
  ])
}

export function refreshTrayTooltip(): void {
  tray?.setToolTip(activity.tooltip())
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
