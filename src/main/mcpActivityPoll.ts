/**
 * Poll remote Brain for recent MCP tool calls — used on Dashboard / HowItWorks
 * when Claude Code / Cursor / Antigravity hit Brain outside Pomnia's IPC.
 *
 * Embedded brain-core forwards mcp-query over fork IPC — no poll needed there.
 */

import { fetchMcpActivity } from '@core/brain/status.js'
import { log } from '@core/index.js'

import { getAppSettings } from './appSettings.js'

const POLL_MS = 1_500

let timer: ReturnType<typeof setInterval> | null = null
let watchRefs = 0
let windowFocused = true
let onQuery: ((ev: { tool?: string; detail?: string }) => void) | null = null
let lastSeenTs = 0

function shouldPoll(): boolean {
  return watchRefs > 0 && windowFocused && !!onQuery
}

function ensureTimer(): void {
  if (timer || !shouldPoll()) return
  timer = setInterval(() => void pollOnce(), POLL_MS)
  void pollOnce()
}

function clearTimer(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export function setMcpActivityWindowFocused(focused: boolean): void {
  windowFocused = focused
  if (shouldPoll()) ensureTimer()
  else clearTimer()
}

export function startMcpActivityPoll(onMcpQuery: (ev: { tool?: string; detail?: string }) => void): void {
  watchRefs += 1
  onQuery = onMcpQuery
  ensureTimer()
}

export function stopMcpActivityPoll(): void {
  watchRefs = Math.max(0, watchRefs - 1)
  if (watchRefs === 0) {
    onQuery = null
    lastSeenTs = 0
    clearTimer()
  }
}

async function pollOnce(): Promise<void> {
  if (!shouldPoll() || !onQuery) return

  const settings = getAppSettings()
  const target = settings.brainTarget ?? 'embedded'
  // Remote only — embedded brain-core emits mcp-query over fork IPC.
  if (target !== 'remote' || !settings.brainMcpUrl?.trim()) return

  const resp = await fetchMcpActivity(settings.brainMcpUrl.trim(), settings.connectToken)
  if (!resp?.recent || !resp.last?.ts) return
  if (resp.last.ts <= lastSeenTs) return
  lastSeenTs = resp.last.ts
  log.info(`mcp-query poll: tool=${resp.last.tool}${resp.last.detail ? ` detail=${resp.last.detail}` : ''}`)
  onQuery({ tool: resp.last.tool, detail: resp.last.detail })
}
