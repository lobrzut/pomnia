/**
 * Stage brain-core runtime for electron-builder extraResources.
 *
 * Output: build/brain-core-runtime-v2/ (or POMNIA_STAGE_DIR)
 *   embedded.js + dist tree
 *   node_modules/ (production deps, better-sqlite3 rebuilt for Electron ABI)
 *
 * Packaged Pomnia launches this via Electron `utilityProcess.fork` (same ABI
 * as main) — no second electron.exe / pomnia-brain.exe / ICU sidecars.
 * See src/main/brainCore.ts.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Prefer locked-dir escape hatch: POMNIA_STAGE_DIR or brain-core-runtime-v2
const stage = process.env.POMNIA_STAGE_DIR
  ? process.env.POMNIA_STAGE_DIR
  : join(root, 'build', 'brain-core-runtime-v2')
const dist = join(root, 'packages', 'brain-core', 'dist')
const bcPkg = JSON.parse(readFileSync(join(root, 'packages', 'brain-core', 'package.json'), 'utf8'))
const electronVer = JSON.parse(
  readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
).version
/** x64 | arm64 — must match the electron-builder --x64/--arm64 flag on CI. */
const nativeArch = process.env.POMNIA_NATIVE_ARCH || process.arch
if (nativeArch !== 'x64' && nativeArch !== 'arm64') {
  throw new Error(`POMNIA_NATIVE_ARCH/process.arch must be x64 or arm64, got ${nativeArch}`)
}

function clearStage(dir) {
  if (!existsSync(dir)) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    // UNC / locked Electron fork: rename aside so pack can continue.
    const stale = `${dir}.stale-${Date.now()}`
    console.warn(`[stage-brain-core] rm failed (${err?.code || err}), renaming → ${stale}`)
    renameSync(dir, stale)
  }
}

clearStage(stage)
mkdirSync(stage, { recursive: true })

console.log('[stage-brain-core] copy dist →', stage)
cpSync(dist, stage, { recursive: true })

writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'brain-core-runtime',
      // The staged manifest carried dependencies and no version, so
      // BRAIN_CORE_VERSION fell through to its '0.0.0' fallback and every
      // shipped build told agents, /healthz and any bug report that it was
      // version 0.0.0. version.ts exists precisely to stop the handshake
      // advertising a number that points at the wrong code; it fixed the
      // stale-number half and this left the no-number half.
      version: bcPkg.version,
      private: true,
      type: 'module',
      dependencies: bcPkg.dependencies
    },
    null,
    2
  )
)

console.log('[stage-brain-core] npm install production deps…')
execSync('npm install --omit=dev --no-package-lock --no-audit --no-fund', {
  cwd: stage,
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_arch: nativeArch,
    npm_config_target_arch: nativeArch,
  },
})

if (process.platform === 'darwin') {
  const vecOpt = `sqlite-vec-darwin-${nativeArch}`
  console.log(`[stage-brain-core] ensure ${vecOpt}…`)
  execSync(
    `npm install ${vecOpt}@${bcPkg.dependencies['sqlite-vec'] || '0.1.9'} --omit=dev --no-package-lock --no-audit --no-fund`,
    { cwd: stage, stdio: 'inherit' },
  )
}

console.log(`[stage-brain-core] electron-rebuild better-sqlite3 ${nativeArch} for Electron ${electronVer}…`)
const stageModules = join(stage, 'node_modules')
const electronDir = join(root, 'node_modules', 'electron')
try {
  execSync(
    `npx @electron/rebuild -f -o better-sqlite3 -v ${electronVer} -a ${nativeArch} -m "${stage}" -e "${electronDir}"`,
    { cwd: root, stdio: 'inherit' }
  )
} catch (err) {
  console.warn('[stage-brain-core] electron-rebuild failed, will try fallback binding…', err?.message || err)
}

const nodeBinding = join(stageModules, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
if (!existsSync(nodeBinding)) {
  const fallback = join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
  if (!existsSync(fallback)) {
    throw new Error(`better_sqlite3.node missing after rebuild: ${nodeBinding}`)
  }
  console.warn('[stage-brain-core] copying Electron ABI binding from root node_modules')
  mkdirSync(dirname(nodeBinding), { recursive: true })
  cpSync(fallback, nodeBinding)
}

if (process.platform === 'darwin' || process.platform === 'linux') {
  try {
    const info = execSync(`file "${nodeBinding}"`, { encoding: 'utf8' }).trim()
    console.log('[stage-brain-core]', info)
    const need = nativeArch === 'x64' ? /x86_64|x86-64|Intel 64/i : /arm64|aarch64/i
    const wrong = nativeArch === 'x64' ? /arm64/i : /x86_64|x86-64/i
    if (wrong.test(info) && !need.test(info)) {
      throw new Error(
        `better_sqlite3.node is the wrong arch for ${nativeArch}: ${info}. ` +
          `Set POMNIA_NATIVE_ARCH and rebuild; do not pack this into a ${nativeArch} DMG.`,
      )
    }
  } catch (err) {
    if (String(err?.message || err).includes('wrong arch')) throw err
    console.warn('[stage-brain-core] file(1) check skipped:', err?.message || err)
  }
}

console.log('[stage-brain-core] skip Electron helper EXE (utilityProcess uses Pomnia ABI)')
// Ask the staged runtime what version it thinks it is, rather than trusting
// that writing the field was enough. Both halves of this have been wrong at
// once: the manifest had no version, and version.js resolved '../package.json'
// against a layout that only exists in the repo. Either one silently yields
// 0.0.0, which is what every shipped build reported until now.
{
  const url = pathToFileURL(join(stage, 'version.js')).href
  const { BRAIN_CORE_VERSION } = await import(url)
  if (BRAIN_CORE_VERSION !== bcPkg.version) {
    throw new Error(
      `staged runtime reports version ${BRAIN_CORE_VERSION}, expected ${bcPkg.version} — ` +
        'agents, /healthz and every bug report would quote the wrong build',
    )
  }
  console.log(`[stage-brain-core] version check OK - runtime reports ${BRAIN_CORE_VERSION}`)
}

console.log('[stage-brain-core] done →', stage)
