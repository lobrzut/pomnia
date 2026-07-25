/**
 * Stage brain-core runtime for electron-builder extraResources.
 *
 * Output: build/brain-core-runtime-v2/ (or POMNIA_STAGE_DIR)
 *   embedded.js + dist tree
 *   node_modules/ (production deps, better-sqlite3 rebuilt for Electron ABI)
 *   pomnia-brain.exe (Win) — copy of Electron binary so the child is NOT a
 *     second Pomnia.exe (Defender / NSIS heuristics; see brainCore.ts)
 *   + Electron Windows sidecars (DLLs, icudtl.dat, *.pak, locales/) — required
 *     because the loader resolves imports next to the EXE path; bare exe alone
 *     dies with STATUS_DLL_NOT_FOUND before IPC ready (brain-core start timeout).
 *
 * Packaged Pomnia forks process.resourcesPath/brain-core/embedded.js — see brainCore.ts.
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

// Dedicated child binary name — avoids two identical Pomnia.exe (AV / installer locks).
if (process.platform === 'win32') {
  const electronDist = join(root, 'node_modules', 'electron', 'dist')
  const electronExe = join(electronDist, 'electron.exe')
  const brainExe = join(stage, 'pomnia-brain.exe')
  if (!existsSync(electronExe)) {
    // Soft fallback used to pack without pomnia-brain.exe → second Pomnia.exe trips Symantec/NSIS.
    throw new Error(
      '[stage-brain-core] electron.exe missing at ' +
        electronExe +
        ' — run `node node_modules/electron/install.js` then retry. Refusing to stage without pomnia-brain.exe.'
    )
  }
  console.log('[stage-brain-core] copy electron.exe → pomnia-brain.exe (AV-friendly child name)')
  cpSync(electronExe, brainExe)
  // PE imports resolve against the EXE directory — not Pomnia.exe's folder.
  const sidecars = [
    'ffmpeg.dll',
    'libEGL.dll',
    'libGLESv2.dll',
    'd3dcompiler_47.dll',
    'vk_swiftshader.dll',
    'vk_swiftshader_icd.json',
    'vulkan-1.dll',
    'icudtl.dat',
    'snapshot_blob.bin',
    'v8_context_snapshot.bin',
    'resources.pak',
    'chrome_100_percent.pak',
    'chrome_200_percent.pak',
  ]
  for (const name of sidecars) {
    const src = join(electronDist, name)
    if (!existsSync(src)) {
      throw new Error(`[stage-brain-core] missing Electron sidecar ${name} at ${src}`)
    }
    cpSync(src, join(stage, name))
  }
  const localesSrc = join(electronDist, 'locales')
  if (existsSync(localesSrc)) {
    console.log('[stage-brain-core] copy Electron locales/ beside pomnia-brain.exe')
    cpSync(localesSrc, join(stage, 'locales'), { recursive: true })
  } else {
    throw new Error(`[stage-brain-core] missing Electron locales at ${localesSrc}`)
  }
  console.log(`[stage-brain-core] copied ${sidecars.length} Electron sidecars + locales`)
} else if (process.platform === 'darwin' || process.platform === 'linux') {
  const electronBin = join(
    root,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron'
  )
  const brainBin = join(stage, 'pomnia-brain')
  if (existsSync(electronBin)) {
    console.log('[stage-brain-core] copy Electron → pomnia-brain (AV-friendly child name)')
    cpSync(electronBin, brainBin)
  }
}

console.log('[stage-brain-core] done →', stage)
