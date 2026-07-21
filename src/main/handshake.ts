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

export function setGoArmed(on: boolean): boolean {
  goArmed = !!on
  broadcastArmed()
  return goArmed
}

export function tryArmHandshake(phrase: string): { ok: boolean; armed: boolean } {
  if (!isHandshakePhrase(phrase)) return { ok: false, armed: goArmed }
  goArmed = true
  broadcastArmed()
  return { ok: true, armed: true }
}

function defaultPosition(): { x: number; y: number } {
  const { workArea } = screen.getPrimaryDisplay()
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

export function isHandshakeVisible(): boolean {
  return !!handshakeWin && !handshakeWin.isDestroyed() && handshakeWin.isVisible()
}

export async function showHandshake(): Promise<void> {
  if (handshakeWin && !handshakeWin.isDestroyed()) {
    handshakeWin.show()
    handshakeWin.focus()
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

  handshakeWin.once('ready-to-show', () => {
    handshakeWin?.show()
    handshakeWin?.focus()
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
