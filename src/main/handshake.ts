/**
 * Personal ritual mini-window — type "OK to Go Go Go", arm session flag.
 * Frameless floating panel (like Na żywo), not an MCP brief.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, screen, type BrowserWindow as BW } from 'electron'
import { getFloatingWebContents } from './floatingMonitor.js'
import { isHandshakePhrase, normalizeHandshakePhrase } from '@core/handshakePhrase.js'

export { isHandshakePhrase, normalizeHandshakePhrase }

const WIDTH = 320
const HEIGHT = 148

let handshakeWin: BW | null = null
let mainWin: BW | null = null
/** Session-only: armed after successful phrase. Resets on app quit. */
let goArmed = false

export function setHandshakeMainWindow(win: BW | null): void {
  mainWin = win
}

export function isGoArmed(): boolean {
  return goArmed
}

function broadcastArmed(): void {
  const payload = { armed: goArmed }
  if (mainWin && !mainWin.isDestroyed()) {
    try {
      mainWin.webContents.send('handshake:armed', payload)
    } catch {
      /* ignore */
    }
  }
  if (handshakeWin && !handshakeWin.isDestroyed()) {
    try {
      handshakeWin.webContents.send('handshake:armed', payload)
    } catch {
      /* ignore */
    }
  }
  const floatingWc = getFloatingWebContents()
  if (floatingWc && !floatingWc.isDestroyed()) {
    try {
      floatingWc.send('handshake:armed', payload)
    } catch {
      /* ignore */
    }
  }
}

export function setGoArmed(armed: boolean): boolean {
  goArmed = !!armed
  broadcastArmed()
  return goArmed
}

export function tryArmHandshake(phrase: string): { ok: boolean; armed: boolean } {
  if (!isHandshakePhrase(phrase)) return { ok: false, armed: goArmed }
  // Always go through setGoArmed(true) so bundlers cannot constant-fold the flag to false
  // (setGoArmed was previously only called with `false` from disarm IPC).
  return { ok: true, armed: setGoArmed(true) }
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
    y: workArea.y + Math.round(workArea.height * 0.28),
  }
}

function loadHandshakeUrl(win: BW): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/handshake`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/handshake' })
}

function bringHandshakeFront(win: BW): void {
  if (win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  // screen-saver level briefly beats other always-on-top apps / focus theft on Windows
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

export function isHandshakeVisible(): boolean {
  return !!handshakeWin && !handshakeWin.isDestroyed() && handshakeWin.isVisible()
}

export async function showHandshake(): Promise<void> {
  if (handshakeWin && !handshakeWin.isDestroyed()) {
    bringHandshakeFront(handshakeWin)
    return
  }

  const pos = defaultPosition()
  const iconCandidates = [
    join(process.resourcesPath, 'icon.ico'),
    join(__dirname, '../../resources/icon.ico'),
  ]
  const iconPath = iconCandidates.find((p) => existsSync(p))

  handshakeWin = new BrowserWindow({
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

  handshakeWin.setAlwaysOnTop(true, 'floating')
  loadHandshakeUrl(handshakeWin)

  const reveal = (): void => {
    if (!handshakeWin || handshakeWin.isDestroyed()) return
    bringHandshakeFront(handshakeWin)
  }
  handshakeWin.once('ready-to-show', reveal)
  // Fallback: ready-to-show can be missed if the page was already ready
  handshakeWin.webContents.once('did-finish-load', () => {
    if (handshakeWin && !handshakeWin.isDestroyed() && !handshakeWin.isVisible()) reveal()
  })
  handshakeWin.on('closed', () => {
    handshakeWin = null
  })
}

export function hideHandshake(): void {
  if (!handshakeWin || handshakeWin.isDestroyed()) return
  handshakeWin.hide()
}

export function destroyHandshake(): void {
  if (handshakeWin && !handshakeWin.isDestroyed()) handshakeWin.destroy()
  handshakeWin = null
}

export async function toggleHandshake(): Promise<boolean> {
  if (isHandshakeVisible()) {
    hideHandshake()
    return false
  }
  await showHandshake()
  return true
}
