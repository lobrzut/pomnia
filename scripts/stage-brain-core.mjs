/**
 * Stage brain-core runtime for electron-builder extraResources.
 *
 * Output: build/brain-core-runtime/
 *   embedded.js + dist tree
 *   node_modules/ (production deps, better-sqlite3 rebuilt for Electron ABI)
 *
 * Packaged Reliqua forks process.resourcesPath/brain-core/embedded.js — see brainCore.ts.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stage = join(root, 'build', 'brain-core-runtime')
const dist = join(root, 'packages', 'brain-core', 'dist')
const bcPkg = JSON.parse(readFileSync(join(root, 'packages', 'brain-core', 'package.json'), 'utf8'))
const electronVer = JSON.parse(
  readFileSync(join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
).version

rmSync(stage, { recursive: true, force: true })
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
execSync(`npx @electron/rebuild -f -w better-sqlite3 -v ${electronVer}`, {
  cwd: stage,
  stdio: 'inherit'
})

const nodeBinding = join(stage, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
if (!existsSync(nodeBinding)) {
  throw new Error(`better_sqlite3.node missing after rebuild: ${nodeBinding}`)
}

console.log('[stage-brain-core] done →', stage)
