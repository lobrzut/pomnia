// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * macOS: Electron/Node often cannot open LAN sockets to Ollama (fetch failed /
 * timeout) while curl from Terminal works. A launchd-owned Python relay talks
 * to LAN Ollama; Pomnia only connects to 127.0.0.1.
 */
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { ollamaNeedsMacOsRelay } from '@core/brain/ollama.js'
import { log } from '@core/log.js'

const execFileAsync = promisify(execFile)

export const OLLAMA_RELAY_PORT = 18765
export const OLLAMA_RELAY_URL = `http://127.0.0.1:${OLLAMA_RELAY_PORT}`

const LABEL = 'ai.pomnia.ollama-relay'

export function needsOllamaRelay(baseUrl: string): boolean {
  return ollamaNeedsMacOsRelay(baseUrl)
}

function agentPlistPath(): string {
  return join(app.getPath('home'), 'Library/LaunchAgents', `${LABEL}.plist`)
}

function relayDir(): string {
  return join(app.getPath('userData'), 'ollama-relay')
}

function relayScriptPath(): string {
  return join(relayDir(), 'ollama-relay.py')
}

function relayLogPath(): string {
  return join(relayDir(), 'relay.log')
}

async function sourceRelayScript(): Promise<string> {
  const candidates = [
    join(app.getAppPath(), 'resources', 'ollama-relay.py'),
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'ollama-relay.py'),
    join(process.resourcesPath, 'ollama-relay.py'),
  ]
  for (const p of candidates) {
    try {
      await readFile(p)
      return p
    } catch {
      /* try next */
    }
  }
  throw new Error('ollama-relay.py not found in app resources')
}

function plistBody(target: string): string {
  const script = relayScriptPath()
  const logFile = relayLogPath()
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${script}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>POMNIA_OLLAMA_TARGET</key><string>${target}</string>
    <key>POMNIA_OLLAMA_RELAY_PORT</key><string>${OLLAMA_RELAY_PORT}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logFile}</string>
  <key>StandardErrorPath</key><string>${logFile}</string>
</dict>
</plist>
`
}

async function launchctl(args: string[]): Promise<void> {
  try {
    await execFileAsync('/bin/launchctl', args, { encoding: 'utf8' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!/not found|No such|Could not find/i.test(msg)) {
      log.debug('launchctl', args.join(' '), msg)
    }
  }
}

async function relayHealthy(timeoutMs = 1500): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      '/usr/bin/curl',
      [
        '-sS',
        '--ipv4',
        '-m',
        String(Math.max(1, Math.ceil(timeoutMs / 1000))),
        '-o',
        '/dev/null',
        '-w',
        '%{http_code}',
        `${OLLAMA_RELAY_URL}/healthz`,
      ],
      { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME || '' } },
    )
    const code = Number(String(stdout).trim())
    return code >= 200 && code < 300
  } catch {
    return false
  }
}

function readPlistTarget(plistXml: string): string | null {
  const m = /<key>POMNIA_OLLAMA_TARGET<\/key>\s*<string>([^<]*)<\/string>/.exec(plistXml)
  return m?.[1] ?? null
}

let ensureLock: Promise<string> | null = null
let lastEnsuredTarget: string | null = null

async function ensureOllamaTransportUrlUnlocked(base: string): Promise<string> {
  if (lastEnsuredTarget === base && (await relayHealthy(800))) {
    return OLLAMA_RELAY_URL
  }

  await mkdir(relayDir(), { recursive: true })
  const src = await sourceRelayScript()
  await copyFile(src, relayScriptPath())

  const plist = agentPlistPath()
  await mkdir(join(app.getPath('home'), 'Library/LaunchAgents'), { recursive: true })

  let existingTarget: string | null = null
  try {
    existingTarget = readPlistTarget(await readFile(plist, 'utf8'))
  } catch {
    /* no plist yet */
  }

  const targetChanged = existingTarget !== base
  if (targetChanged || !(await relayHealthy(500))) {
    await writeFile(plist, plistBody(base), 'utf8')
    const uid = String(process.getuid?.() ?? 501)
    const gui = `gui/${uid}`
    if (targetChanged) {
      await launchctl(['bootout', `${gui}/${LABEL}`])
      await launchctl(['bootstrap', gui, plist])
      await launchctl(['enable', `${gui}/${LABEL}`])
    } else {
      await launchctl(['bootstrap', gui, plist])
      await launchctl(['kickstart', `${gui}/${LABEL}`])
    }

    for (let i = 0; i < 30; i++) {
      if (await relayHealthy(800)) {
        lastEnsuredTarget = base
        log.info(`ollama relay ready → ${base} via ${OLLAMA_RELAY_URL}`)
        return OLLAMA_RELAY_URL
      }
      await new Promise((r) => setTimeout(r, 200))
    }

    log.warn('ollama relay did not become healthy — falling back to direct URL')
    return base
  }

  lastEnsuredTarget = base
  return OLLAMA_RELAY_URL
}

/** Ensure launchd relay is running for a remote Ollama URL; return loopback base URL. */
export async function ensureOllamaTransportUrl(configuredBaseUrl: string): Promise<string> {
  const base = configuredBaseUrl.replace(/\/$/, '')
  if (!needsOllamaRelay(base)) return base

  if (!ensureLock) {
    ensureLock = ensureOllamaTransportUrlUnlocked(base).finally(() => {
      ensureLock = null
    })
  }
  return ensureLock
}
