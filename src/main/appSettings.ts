// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Main-process preferences (tray behaviour). Kept separate from renderer
 * localStorage so close/minimize handlers work even when the window is hidden.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  canonicalizeHandshakePhraseSetting,
  DEFAULT_HANDSHAKE_PHRASE,
} from '@core/handshakePhrase.js'

export type BrainTargetSetting = 'embedded' | 'remote'

/** UI color scheme — mint (current), iris (legacy purple), glass (Szkło — CSS frosted panels). */
export type ColorSchemeSetting = 'mint' | 'iris' | 'glass'

/** App chrome language only — Brain search/distill stay auto bilingual (no knowledgeLang). */
export type UiLocaleSetting = 'pl' | 'en'

export interface AppSettings {
  /** Minimize button hides to tray instead of the taskbar. */
  minimizeToTray: boolean
  /** Close (X) hides to tray instead of quitting — also auto-applied while embedded brain runs. */
  closeToTray: boolean
  /** Saved Ollama base URL (synced from renderer localStorage). Main uses this when IPC omits ollamaUrl. */
  ollamaUrl?: string
  /** Remote Brain MCP base URL (synced from renderer — pomnia.brain.remoteUrl). */
  brainMcpUrl?: string
  /** Brain dashboard deploy URL (:7860) for distilled notes push. */
  brainDeployUrl?: string
  /** embedded = local brain-core; remote = user's LAN/cloud Brain server. */
  brainTarget?: BrainTargetSetting
  /** Bearer token for remote Brain MCP (synced from renderer). */
  connectToken?: string
  /**
   * Where to mirror this vault, and whether to do it automatically.
   *
   * Deliberately separate from `brainMcpUrl`. That address answers "which brain
   * am I using"; this one answers "where do I keep a copy". Reusing it would
   * make replication possible only while *not* using the local brain — exactly
   * backwards, since the machine that owns the vault is the one with something
   * to replicate.
   */
  replicaUrl?: string
  replicaToken?: string
  /** Push after every distillation. Off until asked for. */
  replicaAutoSync?: boolean
  /**
   * Outcome of the last replication, persisted.
   *
   * An auto-sync that fails quietly is worse than no auto-sync: it leaves you
   * believing the server is current. This is what makes it visible, so it is
   * written on failure as well as success.
   */
  lastReplication?: {
    at: string
    ok: boolean
    uploaded: number
    unchanged: number
    failed: number
    error?: string
  }
  /** Auto-start embedded brain on vault open when the user had it running last session. */
  embeddedBrainAutoStart?: boolean
  /** First-run wizard completed — floating monitor skips onboarding. */
  onboarded?: boolean
  /** Show PiP flow monitor when the main window is minimized or hidden to tray. */
  floatingMonitorOnMinimize?: boolean
  /** Keep floating monitor always on top (pin). Default true for PiP. */
  floatingMonitorAlwaysOnTop?: boolean
  /** Last floating monitor window position (multi-monitor). */
  floatingMonitorPosition?: { x: number; y: number }
  /** Launch Pomnia when the user logs into Windows (OS login item). Default off. */
  openAtLogin?: boolean
  /** Desktop + floating windows color scheme (CSS data-theme). Default mint. */
  colorScheme?: ColorSchemeSetting
  /** UI chrome PL | EN. Default pl. Does not affect Brain knowledge language. */
  uiLocale?: UiLocaleSetting
  /**
   * Proof phrase agents should say on their first reply when Pomnia Brain MCP is connected.
   * Configured only in Settings — not a Desktop unlock ritual.
   */
  handshakePhrase?: string
  /**
   * When false, omit Handshake greeting from Connect rules / MCP hints.
   * Default true.
   */
  handshakeEnabled?: boolean
  /**
   * When true (default), agents may call checkpoint_session on milestones
   * without „zapisz do Pomnia”. When false, checkpoint_session refuses.
   */
  autoCheckpointEnabled?: boolean
  /**
   * Last vault root successfully reindexed into library.db.
   * Used to detect portable-vault switches and prune AppData orphans once.
   */
  lastIndexedVaultRoot?: string
  /**
   * Fingerprint from vaultHealth (path + note counts + index chunks).
   * Compared on each vault open / Brain start to detect drift.
   */
  vaultHealthFingerprint?: string
}

const DEFAULTS: AppSettings = {
  minimizeToTray: false,
  closeToTray: true,
  embeddedBrainAutoStart: false,
  floatingMonitorOnMinimize: true,
  floatingMonitorAlwaysOnTop: true,
  openAtLogin: false,
  colorScheme: 'mint',
  uiLocale: 'pl',
  handshakePhrase: DEFAULT_HANDSHAKE_PHRASE,
  handshakeEnabled: true,
  autoCheckpointEnabled: true,
}

function normalizeColorScheme(v: unknown): ColorSchemeSetting {
  return v === 'iris' || v === 'glass' || v === 'mint' ? v : DEFAULTS.colorScheme!
}

function normalizeUiLocale(v: unknown): UiLocaleSetting {
  return v === 'en' || v === 'pl' ? v : DEFAULTS.uiLocale!
}

/** Trim + min-length guard; empty/too-short falls back. Default-equivalent drops misleading "!". */
function normalizeHandshakePhraseSetting(v: unknown, fallback = DEFAULT_HANDSHAKE_PHRASE): string {
  if (typeof v !== 'string') return fallback
  return canonicalizeHandshakePhraseSetting(v, fallback)
}

let cached: AppSettings = { ...DEFAULTS }
let settingsPath = ''

function filePath(): string {
  if (!settingsPath) settingsPath = join(app.getPath('userData'), 'app-settings.json')
  return settingsPath
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(filePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    cached = {
      minimizeToTray: parsed.minimizeToTray ?? DEFAULTS.minimizeToTray,
      closeToTray: parsed.closeToTray ?? DEFAULTS.closeToTray,
      ollamaUrl: parsed.ollamaUrl,
      brainMcpUrl: parsed.brainMcpUrl,
      brainDeployUrl: parsed.brainDeployUrl,
      brainTarget: parsed.brainTarget,
      connectToken: parsed.connectToken,
      replicaUrl: parsed.replicaUrl,
      replicaToken: parsed.replicaToken,
      replicaAutoSync: parsed.replicaAutoSync ?? false,
      lastReplication: parsed.lastReplication,
      embeddedBrainAutoStart: parsed.embeddedBrainAutoStart ?? DEFAULTS.embeddedBrainAutoStart,
      onboarded: parsed.onboarded,
      floatingMonitorOnMinimize: parsed.floatingMonitorOnMinimize ?? DEFAULTS.floatingMonitorOnMinimize,
      floatingMonitorAlwaysOnTop: parsed.floatingMonitorAlwaysOnTop ?? DEFAULTS.floatingMonitorAlwaysOnTop,
      floatingMonitorPosition: parsed.floatingMonitorPosition,
      openAtLogin: parsed.openAtLogin ?? DEFAULTS.openAtLogin,
      colorScheme: normalizeColorScheme(parsed.colorScheme),
      uiLocale: normalizeUiLocale(parsed.uiLocale),
      handshakePhrase: normalizeHandshakePhraseSetting(
        parsed.handshakePhrase,
        DEFAULTS.handshakePhrase,
      ),
      handshakeEnabled: parsed.handshakeEnabled ?? DEFAULTS.handshakeEnabled,
      autoCheckpointEnabled: parsed.autoCheckpointEnabled ?? DEFAULTS.autoCheckpointEnabled,
      lastIndexedVaultRoot: parsed.lastIndexedVaultRoot,
      vaultHealthFingerprint: parsed.vaultHealthFingerprint,
    }
    // Persist display canonicalization (e.g. "OK to Go Go Go!" → "OK to Go Go Go").
    if (
      typeof parsed.handshakePhrase === 'string' &&
      parsed.handshakePhrase.trim() !== (cached.handshakePhrase ?? '')
    ) {
      try {
        await fs.mkdir(app.getPath('userData'), { recursive: true })
        await fs.writeFile(filePath(), JSON.stringify(cached, null, 2), 'utf8')
      } catch {
        /* ignore */
      }
    }
  } catch {
    cached = { ...DEFAULTS }
  }
  return { ...cached }
}

export function getAppSettings(): AppSettings {
  return { ...cached }
}

export async function setAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...cached, ...patch }
  if (Object.prototype.hasOwnProperty.call(patch, 'colorScheme')) {
    next.colorScheme = normalizeColorScheme(patch.colorScheme)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uiLocale')) {
    next.uiLocale = normalizeUiLocale(patch.uiLocale)
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'handshakePhrase')) {
    // Empty / too short: keep previous (or default) — never persist invalid phrase.
    next.handshakePhrase = normalizeHandshakePhraseSetting(
      patch.handshakePhrase,
      cached.handshakePhrase ?? DEFAULTS.handshakePhrase!,
    )
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'handshakeEnabled')) {
    next.handshakeEnabled = !!patch.handshakeEnabled
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoCheckpointEnabled')) {
    next.autoCheckpointEnabled = !!patch.autoCheckpointEnabled
  }
  cached = next
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(filePath(), JSON.stringify(cached, null, 2), 'utf8')
  if (Object.prototype.hasOwnProperty.call(patch, 'openAtLogin')) {
    applyLoginItemSettings()
  }
  return { ...cached }
}

/** Sync Electron OS login item with persisted openAtLogin (default off). */
export function applyLoginItemSettings(): void {
  try {
    // Unsigned macOS builds cannot register login items. Calling the API with
    // openAtLogin:false still logs "Unable to set login item: Operation not permitted".
    if (process.platform === 'darwin' && !cached.openAtLogin) return
    app.setLoginItemSettings({ openAtLogin: !!cached.openAtLogin })
  } catch {
    /* unsupported platform / tests / TCC */
  }
}

/** Whether closing the window should hide to tray instead of quitting. */
export function shouldHideOnClose(embeddedBrainRunning: boolean): boolean {
  const s = getAppSettings()
  return embeddedBrainRunning || s.closeToTray
}

export function shouldHideOnMinimize(): boolean {
  return getAppSettings().minimizeToTray
}
