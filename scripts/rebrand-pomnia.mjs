#!/usr/bin/env node
/**
 * One-shot rebrand: Reliqua → Pomnia across source/docs (excludes node_modules, out, release, .git).
 */
import { promises as fs } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const SKIP_DIRS = new Set(['node_modules', 'out', 'release', '.git', 'dist'])
const SKIP_FILES = new Set(['rebrand-pomnia.mjs', '_pack_full.txt', '_agent_out.txt', 'package-lock.json', '.gitignore'])

const REPLACEMENTS = [
  ['@reliqua/brain-core', '@pomnia/brain-core'],
  ['ReliquaBridge', 'PomniaBridge'],
  ['window.reliqua', 'window.pomnia'],
  ["exposeInMainWorld('reliqua'", "exposeInMainWorld('pomnia'"],
  ['(window as any).reliqua', '(window as any).pomnia'],
  // legacy Electron appId (technical identifier — not a username path; keep for migration accuracy)
  ['dev.helluk.reliqua', 'ai.pomnia.app'],
  ['.reliqua-index.json', '.pomnia-index.json'],
  ['.reliqua-skills', '.pomnia-skills'],
  ['MyVault.reliqua', 'MyVault.pomnia'],
  ['Reliqua.reliqua', 'Pomnia.pomnia'],
  ['Reliqua.continuum', 'Pomnia.pomnia'],
  ['*.reliqua', '*.pomnia'],
  ['.reliqua folder', '.pomnia folder'],
  ['copy the .reliqua', 'copy the .pomnia'],
  ['%AppData%/reliqua/', '%AppData%/Pomnia/'],
  ['~/.reliqua/', '~/.pomnia/'],
  ['join(homedir(), \'.reliqua\'', "join(homedir(), '.pomnia'"],
  ['Reliqua.exe', 'Pomnia.exe'],
  ['Reliqua.app', 'Pomnia.app'],
  ['Reliqua-${', 'Pomnia-${'],
  ['Reliqua-*', 'Pomnia-*'],
  ['Reliqua 0.1', 'Pomnia 0.1'],
  ['Reliqua —', 'Pomnia —'],
  ['Reliqua ×', 'Pomnia ×'],
  ['Reliqua Vault', 'Pomnia Vault'],
  ['Enter Reliqua', 'Enter Pomnia'],
  ['Otwórz Reliqua', 'Otwórz Pomnię'],
  ['RELIQUA', 'POMNIA'],
  ['Reliqua', 'Pomnia'],
  ['reliqua-macos-dmg', 'pomnia-macos-dmg'],
  ['reliqua-web', 'pomnia-web'],
  ['reliqua-design', 'pomnia-design'],
  ['reliqua-deploy-', 'pomnia-deploy-'],
  ['reliqua-ag-', 'pomnia-ag-'],
  ['reliqua-test', 'pomnia-test'],
  ['distilled_via: pomnia', 'distilled_via: pomnia'], // idempotent
  ['distilled_via: reliqua', 'distilled_via: pomnia'],
  ['"name": "reliqua"', '"name": "pomnia"'],
  ['"reliqua":', '"pomnia":'],
  ['productName: Pomnia', 'productName: Pomnia'], // idempotent after Reliqua→Pomnia
]

async function walk(dir, files = []) {
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue
    const p = join(dir, ent.name)
    if (ent.isDirectory()) await walk(p, files)
    else if (!SKIP_FILES.has(ent.name)) files.push(p)
  }
  return files
}

function shouldProcess(file) {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  const allowed = new Set(['ts', 'tsx', 'js', 'mjs', 'json', 'yml', 'yaml', 'md', 'mdc', 'html', 'gitignore'])
  if (!allowed.has(ext) && !file.endsWith('.gitignore')) return false
  if (file.includes('node_modules')) return false
  return true
}

let changed = 0
const files = (await walk(ROOT)).filter(shouldProcess)
for (const file of files) {
  let text = await fs.readFile(file, 'utf8')
  const orig = text
  for (const [from, to] of REPLACEMENTS) {
    text = text.split(from).join(to)
  }
  // Restore external GitHub repo URLs that are not our product name
  text = text.replace(/lobrzut\/pomnia-brain-hub/g, 'lobrzut/reliqua-brain-hub')
  if (text !== orig) {
    await fs.writeFile(file, text, 'utf8')
    changed++
    console.log('updated', relative(ROOT, file))
  }
}
console.log(`\n${changed} files updated`)
