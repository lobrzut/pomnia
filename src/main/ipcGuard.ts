// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Desktop IPC / navigation boundary (F20).
 *
 * contextIsolation stays on; sandbox stays false (ESM preload from electron-vite
 * does not load under sandbox without a separate CJS bridge — do not flip
 * sandbox:true blindly). This module adds:
 *   - trusted renderer URL checks for invoke senders
 *   - role checks (main vs floating vs profile-preview channels)
 *   - will-navigate / will-frame-navigate deny for unexpected targets
 */
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  type IpcMainEvent,
  type WebContents,
} from 'electron'

export type IpcWindowRole = 'main' | 'floating' | 'profile-preview'

export type TrustedUrlEnv = {
  /** Dev server base, e.g. http://localhost:5173 — usually ELECTRON_RENDERER_URL. */
  rendererDevUrl?: string | null
}

/** Channels any Pomnia window may invoke (shared chrome / status). */
const SHARED_TRUSTED_CHANNELS = new Set([
  'activity:get',
  'activity:lastReplay',
  'mcpActivity:watch',
  'brainCore:status',
  'app:settings',
  'app:version',
])

let mainWebContents: WebContents | null = null
let floatingWebContents: WebContents | null = null
let profileWebContents: WebContents | null = null

export function setIpcMainWebContents(wc: WebContents | null): void {
  mainWebContents = wc && !wc.isDestroyed() ? wc : null
}

export function setIpcFloatingWebContents(wc: WebContents | null): void {
  floatingWebContents = wc && !wc.isDestroyed() ? wc : null
}

export function setIpcProfileWebContents(wc: WebContents | null): void {
  profileWebContents = wc && !wc.isDestroyed() ? wc : null
}

/** Pure URL check — unit-tested without Electron. */
export function isTrustedRendererUrl(url: string, env: TrustedUrlEnv = {}): boolean {
  if (!url || url === 'about:blank') return false
  const dev = env.rendererDevUrl ?? null
  try {
    const u = new URL(url)
    if (dev) {
      try {
        const d = new URL(dev)
        if (u.origin === d.origin) return true
      } catch {
        /* ignore bad dev url */
      }
    }
    if (u.protocol === 'file:') {
      const path = decodeURIComponent(u.pathname).replace(/\\/g, '/')
      return /\/renderer\/index\.html$/i.test(path)
    }
    return false
  } catch {
    return false
  }
}

/**
 * Navigations the renderer is allowed to perform in-place.
 * External http(s) must go through setWindowOpenHandler → openExternal, not here.
 */
export function isAllowedRendererNavigation(url: string, env: TrustedUrlEnv = {}): boolean {
  return isTrustedRendererUrl(url, env)
}

export function roleForChannel(channel: string): IpcWindowRole | 'any-trusted' {
  if (channel.startsWith('floating-monitor:')) return 'floating'
  if (channel.startsWith('profile-preview:')) return 'profile-preview'
  if (SHARED_TRUSTED_CHANNELS.has(channel)) return 'any-trusted'
  // Default: vault / FS / import / brain — main window only.
  return 'main'
}

export function senderMatchesRole(
  sender: WebContents,
  role: IpcWindowRole | 'any-trusted',
): boolean {
  const isMain = !!mainWebContents && sender === mainWebContents
  const isFloating = !!floatingWebContents && sender === floatingWebContents
  const isProfile = !!profileWebContents && sender === profileWebContents
  if (role === 'main') return isMain
  if (role === 'floating') return isFloating || isMain
  if (role === 'profile-preview') return isProfile || isMain
  return isMain || isFloating || isProfile
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  channel: string,
  env: TrustedUrlEnv = {},
): void {
  const sender = event.sender
  if (!sender || sender.isDestroyed()) {
    throw new Error(`IPC refused (${channel}): destroyed sender`)
  }

  const frame = 'senderFrame' in event ? event.senderFrame : null
  const frameUrl =
    frame && typeof frame.url === 'string' ? frame.url : sender.getURL()
  const dev = env.rendererDevUrl ?? process.env.ELECTRON_RENDERER_URL ?? null

  const win = BrowserWindow.fromWebContents(sender)
  if (!win || win.isDestroyed()) {
    throw new Error(`IPC refused (${channel}): no BrowserWindow`)
  }

  const registered =
    sender === mainWebContents ||
    sender === floatingWebContents ||
    sender === profileWebContents
  if (!registered) {
    throw new Error(`IPC refused (${channel}): unknown window`)
  }

  // While the first document is loading, Electron may still report about:blank.
  if (
    frameUrl &&
    frameUrl !== 'about:blank' &&
    !isTrustedRendererUrl(frameUrl, { rendererDevUrl: dev })
  ) {
    throw new Error(`IPC refused (${channel}): untrusted URL`)
  }

  const role = roleForChannel(channel)
  if (!senderMatchesRole(sender, role)) {
    throw new Error(`IPC refused (${channel}): window role mismatch`)
  }
}

export function attachRendererNavigationGuards(
  wc: WebContents,
  warn: (msg: string) => void,
  env: TrustedUrlEnv = {},
): void {
  const dev = env.rendererDevUrl ?? process.env.ELECTRON_RENDERER_URL ?? null
  const block = (url: string): boolean => {
    if (isAllowedRendererNavigation(url, { rendererDevUrl: dev })) return false
    warn(`blocked unexpected navigation: ${url.slice(0, 160)}`)
    return true
  }

  wc.on('will-navigate', (e, url) => {
    if (block(url)) e.preventDefault()
  })

  // Electron 33+: subframe navigations.
  wc.on('will-frame-navigate', (e) => {
    if (block(e.url)) e.preventDefault()
  })
}
