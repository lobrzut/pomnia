// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Picture-in-Picture style floating flow monitor — always-on-top mini window.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, screen, type WebContents } from 'electron'
import { getAppSettings, setAppSettings } from './appSettings.js'

/** Compact PiP strip: header + Vault → library → MCP; matches FlowDiagram pip layout. */
const WIDTH = 300
const HEIGHT = 118
const SNAP_THRESHOLD = 96

let floatingWin: BrowserWindow | null = null
let mainWin: BrowserWindow | null = null
let moveDebounce: ReturnType<typeof setTimeout> | null = null

export function setFloatingMainWindow(win: BrowserWindow | null): void {
  mainWin = win
}

export function isFloatingMonitorVisible(): boolean {
  return !!floatingWin && !floatingWin.isDestroyed() && floatingWin.isVisible()
}

export function getFloatingWebContents(): WebContents | null {
  if (!floatingWin || floatingWin.isDestroyed()) return null
  return floatingWin.webContents
}

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
  return { x: workArea.x + workArea.width - WIDTH - 16, y: workArea.y + workArea.height - HEIGHT - 16 }
}

function snapToCorner(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: x + width / 2, y: y + height / 2 })
  const area = display.workArea
  const corners = [
    { x: area.x + 8, y: area.y + 8 },
    { x: area.x + area.width - width - 8, y: area.y + 8 },
    { x: area.x + area.width - width - 8, y: area.y + area.height - height - 8 },
    { x: area.x + 8, y: area.y + area.height - height - 8 },
  ]
  let best = { x, y }
  let bestDist = Infinity
  for (const c of corners) {
    const d = Math.hypot(x - c.x, y - c.y)
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  return bestDist <= SNAP_THRESHOLD ? best : { x, y }
}

function persistPosition(x: number, y: number): void {
  void setAppSettings({ floatingMonitorPosition: { x, y } })
}

function attachMoveSnap(win: BrowserWindow): void {
  win.on('moved', () => {
    if (moveDebounce) clearTimeout(moveDebounce)
    moveDebounce = setTimeout(() => {
      moveDebounce = null
      if (!floatingWin || floatingWin.isDestroyed()) return
      const [x, y] = floatingWin.getPosition()
      const [w, h] = floatingWin.getSize()
      const snapped = snapToCorner(x, y, w, h)
      if (snapped.x !== x || snapped.y !== y) floatingWin.setPosition(snapped.x, snapped.y)
      persistPosition(snapped.x, snapped.y)
    }, 120)
  })
}

function loadFloatingUrl(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/floating-monitor`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/floating-monitor' })
}

export function canAutoShowFloatingMonitor(vaultOpen: boolean): boolean {
  const s = getAppSettings()
  if (!vaultOpen || s.onboarded === false) return false
  return s.floatingMonitorOnMinimize !== false
}

export async function showFloatingMonitor(opts?: { force?: boolean }): Promise<void> {
  const s = getAppSettings()
  if (!opts?.force && s.onboarded === false) return

  if (floatingWin && !floatingWin.isDestroyed()) {
    floatingWin.setSize(WIDTH, HEIGHT)
    floatingWin.show()
    return
  }

  const pos = s.floatingMonitorPosition ?? defaultPosition()
  const pinned = s.floatingMonitorAlwaysOnTop !== false
  const iconCandidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
  ]
  const iconPath = iconCandidates.find((p) => existsSync(p))

  floatingWin = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: pinned,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: false,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  if (pinned) floatingWin.setAlwaysOnTop(true, 'floating')
  attachMoveSnap(floatingWin)
  loadFloatingUrl(floatingWin)

  floatingWin.once('ready-to-show', () => floatingWin?.show())
  floatingWin.on('closed', () => {
    floatingWin = null
  })
}

export function isFloatingAlwaysOnTop(): boolean {
  return getAppSettings().floatingMonitorAlwaysOnTop !== false
}

export async function setFloatingAlwaysOnTop(on: boolean): Promise<boolean> {
  await setAppSettings({ floatingMonitorAlwaysOnTop: on })
  if (floatingWin && !floatingWin.isDestroyed()) {
    if (on) floatingWin.setAlwaysOnTop(true, 'floating')
    else floatingWin.setAlwaysOnTop(false)
  }
  return on
}

export function hideFloatingMonitor(): void {
  if (!floatingWin || floatingWin.isDestroyed()) return
  floatingWin.hide()
}

export function destroyFloatingMonitor(): void {
  if (moveDebounce) {
    clearTimeout(moveDebounce)
    moveDebounce = null
  }
  if (floatingWin && !floatingWin.isDestroyed()) floatingWin.destroy()
  floatingWin = null
}

export async function toggleFloatingMonitor(): Promise<boolean> {
  if (isFloatingMonitorVisible()) {
    hideFloatingMonitor()
    return false
  }
  await showFloatingMonitor({ force: true })
  return true
}

export function openMainOnGuide(): void {
  if (!mainWin || mainWin.isDestroyed()) return
  mainWin.show()
  mainWin.focus()
  mainWin.webContents.send('app:navigate', 'guide')
}

export function maybeShowFloatingOnHide(vaultOpen: boolean): void {
  if (!canAutoShowFloatingMonitor(vaultOpen)) return
  void showFloatingMonitor()
}

export function hideFloatingWhenMainShown(): void {
  hideFloatingMonitor()
}
