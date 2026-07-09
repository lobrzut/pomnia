/**
 * Poll remote (or embedded) Brain for recent MCP tool calls — used on the
 * HowItWorks page when Claude Code / Cursor hit Brain outside Pomnia's IPC.
 */

import { fetchMcpActivity } from '@core/brain/status.js'

import { getAppSettings } from './appSettings.js'
import { brainCore } from './brainCore.js'

const POLL_MS = 2_000

let timer: ReturnType<typeof setInterval> | null = null
let watching = false
let onQuery: ((ev: { tool?: string; detail?: string }) => void) | null = null
let lastSeenTs = 0

export function startMcpActivityPoll(onMcpQuery: (ev: { tool?: string; detail?: string }) => void): void {
  watching = true
  onQuery = onMcpQuery
  if (timer) return
  timer = setInterval(() => void pollOnce(), POLL_MS)
  void pollOnce()
}

export function stopMcpActivityPoll(): void {
  watching = false
  onQuery = null
  lastSeenTs = 0
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function pollOnce(): Promise<void> {
  if (!watching || !onQuery) return

  const settings = getAppSettings()
  const target = settings.brainTarget ?? 'embedded'
  let baseUrl: string | null = null
  let token: string | undefined

  if (target === 'remote' && settings.brainMcpUrl?.trim()) {
    baseUrl = settings.brainMcpUrl.trim()
    token = settings.connectToken
  } else if (brainCore.status().running && brainCore.status().url) {
    baseUrl = brainCore.status().url!
  } else {
    return
  }

  const resp = await fetchMcpActivity(baseUrl, token)
  if (!resp?.recent || !resp.last?.ts) return
  if (resp.last.ts <= lastSeenTs) return
  lastSeenTs = resp.last.ts
  onQuery({ tool: resp.last.tool, detail: resp.last.detail })
}
