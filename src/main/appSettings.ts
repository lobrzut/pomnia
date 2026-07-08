/**
 * Main-process preferences (tray behaviour). Kept separate from renderer
 * localStorage so close/minimize handlers work even when the window is hidden.
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export interface AppSettings {
  /** Minimize button hides to tray instead of the taskbar. */
  minimizeToTray: boolean
  /** Close (X) hides to tray instead of quitting — also auto-applied while embedded brain runs. */
  closeToTray: boolean
  /** Saved Ollama base URL (synced from renderer localStorage). Main uses this when IPC omits ollamaUrl. */
  ollamaUrl?: string
  /** Auto-start embedded brain on vault open when the user had it running last session. */
  embeddedBrainAutoStart?: boolean
}

const DEFAULTS: AppSettings = {
  minimizeToTray: false,
  closeToTray: true,
  embeddedBrainAutoStart: false,
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
      embeddedBrainAutoStart: parsed.embeddedBrainAutoStart ?? DEFAULTS.embeddedBrainAutoStart,
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
