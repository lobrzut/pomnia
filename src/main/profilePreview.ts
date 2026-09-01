// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Ephemeral user profile preview — frameless floating panel (mirrors Handshake).
 * Destroyed on close; each open regenerates content. Save writes USER.md to vault.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, screen, type BrowserWindow as BW } from 'electron'

const WIDTH = 380
const HEIGHT = 440

let profileWin: BW | null = null
let mainWin: BW | null = null

export function setProfilePreviewMainWindow(win: BW | null): void {
  mainWin = win
}

function defaultPosition(): { x: number; y: number } {
  const anchor =
    mainWin && !mainWin.isDestroyed()
      ? (() => {
          const [x, y] = mainWin.getPosition()
          const [w, h] = mainWin.getSize()
          return { x: x + Math.round(w / 2), y: y + Math.round(h / 2) }
        })()
      : screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(anchor)
  return {
    x: workArea.x + Math.round((workArea.width - WIDTH) / 2),
    y: workArea.y + Math.round(workArea.height * 0.22),
  }
}

function loadProfileUrl(win: BW): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/profile-preview`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/profile-preview' })
}

function bringFront(win: BW): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  win.moveTop()
  win.focus()
  win.setAlwaysOnTop(true, 'floating')
  try {
    win.webContents.focus()
  } catch {
    /* ignore */
  }
}

export function isProfilePreviewVisible(): boolean {
  return !!profileWin && !profileWin.isDestroyed() && profileWin.isVisible()
}

export function destroyProfilePreview(): void {
  if (profileWin && !profileWin.isDestroyed()) profileWin.destroy()
  profileWin = null
}

/** Close = destroy (ephemeral). */
export function hideProfilePreview(): void {
  destroyProfilePreview()
}

/**
 * Always recreate so reopen regenerates content.
 */
export async function showProfilePreview(): Promise<void> {
  destroyProfilePreview()

  const pos = defaultPosition()
  const iconCandidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
  ]
  const iconPath = iconCandidates.find((p) => existsSync(p))

  profileWin = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    hasShadow: false,
    focusable: true,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: false,
    },
  })

  profileWin.setAlwaysOnTop(true, 'floating')
  loadProfileUrl(profileWin)

  const reveal = (): void => {
    if (!profileWin || profileWin.isDestroyed()) return
    bringFront(profileWin)
  }
  profileWin.once('ready-to-show', reveal)
  profileWin.webContents.once('did-finish-load', () => {
    if (profileWin && !profileWin.isDestroyed() && !profileWin.isVisible()) reveal()
  })
  profileWin.on('closed', () => {
    profileWin = null
  })
}
