/**
 * Phase-1 UI smoke: packaged Electron first window only.
 *
 * Isolation (HARD):
 *   - never opens C:\Vault
 *   - never uses %APPDATA%\pomnia
 *   - disposable --user-data-dir under %TEMP%\pomnia-e2e-*
 *
 * Prereq: release/win-unpacked/Pomnia.exe (npm run pack:win) + playwright-core
 * Run:    npm run test:e2e:smoke
 */

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const defaultExe = join(root, 'release', 'win-unpacked', 'Pomnia.exe')
const exe = process.env.POMNIA_EXE || defaultExe
const artifactsDir = join(root, 'e2e', 'artifacts')

const appDataPomnia = join(
  process.env.APPDATA || join(tmpdir(), 'AppData-Roaming-missing'),
  'pomnia',
)

function die(code, msg) {
  console.error(`[e2e-smoke] FAIL: ${msg}`)
  process.exit(code)
}

if (!existsSync(exe)) {
  die(
    2,
    `missing executable.\n` +
      `  looked for: ${exe}\n` +
      `  Build first: npm run pack:win\n` +
      `  Or set POMNIA_EXE to a packaged Pomnia.exe`,
  )
}

let electron
try {
  ;({ _electron: electron } = await import('playwright-core'))
} catch {
  die(
    2,
    'playwright-core not installed.\n' +
      '  Run: npm i -D playwright-core\n' +
      '  (no browser download needed for Electron)',
  )
}

const runRoot = mkdtempSync(join(tmpdir(), 'pomnia-e2e-'))
const userData = join(runRoot, 'userData')
const vaultDir = join(runRoot, 'vault')
mkdirSync(userData, { recursive: true })
mkdirSync(vaultDir, { recursive: true })
mkdirSync(artifactsDir, { recursive: true })

writeFileSync(
  join(runRoot, 'README.txt'),
  [
    'Disposable Pomnia E2E run — safe to delete.',
    `userData=${userData}`,
    `vault=${vaultDir}`,
    'Do NOT point this at C:\\Vault or %APPDATA%\\pomnia.',
    '',
  ].join('\n'),
)

// Hard guard: paths must stay under TEMP run root
for (const [label, p] of [
  ['userData', userData],
  ['vault', vaultDir],
]) {
  if (!p.startsWith(runRoot)) {
    die(3, `isolation broken: ${label} escaped runRoot (${p})`)
  }
  if (p.toLowerCase().startsWith('c:\\vault')) {
    die(3, `refusing to use C:\\Vault as ${label}`)
  }
  if (p.toLowerCase().startsWith(appDataPomnia.toLowerCase())) {
    die(3, `refusing to use %APPDATA%\\pomnia as ${label}`)
  }
}

console.log('[e2e-smoke] exe:', exe)
console.log('[e2e-smoke] runRoot:', runRoot)
console.log('[e2e-smoke] userData:', userData)
console.log('[e2e-smoke] vault (unused until onboarding):', vaultDir)

const app = await electron.launch({
  executablePath: exe,
  args: [`--user-data-dir=${userData}`],
  env: {
    ...process.env,
    POMNIA_VAULT: vaultDir,
  },
  timeout: 60_000,
})

let ok = false
try {
  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {})
  await page.waitForSelector('#root', { timeout: 60_000 })

  const title = await page.title()
  if (!/pomnia/i.test(title)) {
    throw new Error(`unexpected window title: ${JSON.stringify(title)}`)
  }

  const rootBox = await page.locator('#root').boundingBox()
  if (!rootBox || rootBox.width < 10 || rootBox.height < 10) {
    throw new Error(`#root not visibly laid out: ${JSON.stringify(rootBox)}`)
  }

  const shot = join(artifactsDir, 'smoke-first-window.png')
  await page.screenshot({ path: shot, fullPage: true })

  console.log('[e2e-smoke] title:', title)
  console.log('[e2e-smoke] #root:', `${Math.round(rootBox.width)}x${Math.round(rootBox.height)}`)
  console.log('[e2e-smoke] screenshot:', shot)
  console.log('[e2e-smoke] OK — first window up (onboarding flow = phase 2)')
  ok = true
} catch (err) {
  console.error(
    '[e2e-smoke] FAIL during window assert:',
    err instanceof Error ? err.message : err,
  )
} finally {
  // Packaged app may hide-on-close while brain-core runs — force real exit.
  await app.evaluate(async ({ app: electronApp }) => {
    electronApp.exit(0)
  }).catch(() => {})
  await app.close().catch(() => {})
  try {
    rmSync(runRoot, { recursive: true, force: true })
    console.log('[e2e-smoke] cleaned temp:', runRoot)
  } catch (err) {
    console.warn(
      '[e2e-smoke] temp cleanup failed (safe to delete manually):',
      runRoot,
      err instanceof Error ? err.message : err,
    )
  }
}

process.exit(ok ? 0 : 1)
