/**
 * Main-process preferences (tray behaviour). Kept separate from renderer
 * localStorage so close/minimize handlers work even when the window is hidden.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type BrainTargetSetting = 'embedded' | 'remote'

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
}

const DEFAULTS: AppSettings = {
  minimizeToTray: false,
  closeToTray: true,
  embeddedBrainAutoStart: false,
  floatingMonitorOnMinimize: true,
  floatingMonitorAlwaysOnTop: true,
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
      embeddedBrainAutoStart: parsed.embeddedBrainAutoStart ?? DEFAULTS.embeddedBrainAutoStart,
      onboarded: parsed.onboarded,
      floatingMonitorOnMinimize: parsed.floatingMonitorOnMinimize ?? DEFAULTS.floatingMonitorOnMinimize,
      floatingMonitorAlwaysOnTop: parsed.floatingMonitorAlwaysOnTop ?? DEFAULTS.floatingMonitorAlwaysOnTop,
      floatingMonitorPosition: parsed.floatingMonitorPosition,
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
  cached = { ...cached, ...patch }
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(filePath(), JSON.stringify(cached, null, 2), 'utf8')
  return { ...cached }
}

/** Whether closing the window should hide to tray instead of quitting. */
export function shouldHideOnClose(embeddedBrainRunning: boolean): boolean {
  const s = getAppSettings()
  return embeddedBrainRunning || s.closeToTray
}

export function shouldHideOnMinimize(): boolean {
  return getAppSettings().minimizeToTray
}
