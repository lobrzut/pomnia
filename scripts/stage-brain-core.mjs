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
import { fileURLToPath } from 'node:url'
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
  stdio: 'inherit'
})

console.log(`[stage-brain-core] electron-rebuild better-sqlite3 for Electron ${electronVer}…`)
const stageModules = join(stage, 'node_modules')
const electronDir = join(root, 'node_modules', 'electron')
try {
  execSync(
    `npx @electron/rebuild -f -o better-sqlite3 -v ${electronVer} -m "${stage}" -e "${electronDir}"`,
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

console.log('[stage-brain-core] skip Electron helper EXE (utilityProcess uses Pomnia ABI)')
console.log('[stage-brain-core] done →', stage)
