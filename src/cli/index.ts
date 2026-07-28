#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Pomnia CLI — headless backup. Designed to be automation-friendly:
 * pass the vault passphrase via $POMNIA_PASS to run unattended (e.g. cron /
 * scheduled tasks / a "bypass" autonomous loop).
 *
 *   pomnia scan
 *   pomnia backup  --vault <dir> [--create] [--name N] [--sources all|a,b] [--note "…"]
 *   pomnia list    --vault <dir>
 *   pomnia dump-library --vault <dir>
 *   pomnia verify  --vault <dir>
 *   pomnia brain-export --out <dir> [--vault <dir> --snapshot <id>] [--sources all]
 */
import { createInterface } from 'node:readline'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  ADAPTERS,
  Ollama,
  Vault,
  buildIndex,
  defaultOllamaConfig,
  deployDashboard,
  deployFilesystem,
  buildSnippet,
  checkAllClients,
  detectAll,
  distillAll,
  exportConversationsToDir,
  getAdapter,
  listAllSkills,
  listClients,
  loadIndex,
  parseExportPath,
  pingBrain,
  runBackup,
  saveIndex,
  searchIndex,
  syncSkills,
  triggerReindex,
  type ClientId,
  type Conversation,
  type SourceId
} from '../core/index.js'

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`
}

interface Parsed {
  cmd: string
  positional: string[]
  flags: Record<string, string | boolean>
}

function parse(argv: string[]): Parsed {
  const [cmd = 'help', ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else positional.push(a)
  }
  return { cmd, positional, flags }
}

function human(bytes: number): string {
  const u = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  if (hidden) {
    const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void }
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (s: string) {
      if (s.includes(question)) stdout.write(s)
      else stdout.write('*')
    }
  }
  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(ans)
    })
  )
}

async function getPass(flags: Parsed['flags'], confirm = false): Promise<string> {
  if (typeof flags.pass === 'string') return flags.pass
  if (process.env.POMNIA_PASS) return process.env.POMNIA_PASS
  if (process.env.RELIQUA_PASS) return process.env.RELIQUA_PASS
  const p = await prompt('Vault passphrase: ', true)
  if (confirm) {
    const p2 = await prompt('Confirm passphrase: ', true)
    if (p !== p2) {
      console.error(C.red('Passphrases do not match.'))
      process.exit(1)
    }
  }
  return p
}

function resolveSources(flag: string | boolean | undefined): SourceId[] {
  if (!flag || flag === 'all' || flag === true) return ADAPTERS.map((a) => a.id)
  return String(flag)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as SourceId[]
}

function ollamaFrom(flags: Parsed['flags']): Ollama {
  const cfg = defaultOllamaConfig()
  if (typeof flags.ollama === 'string') cfg.baseUrl = flags.ollama
  if (typeof flags.model === 'string') cfg.chatModel = flags.model
  if (typeof flags.embed === 'string') cfg.embedModel = flags.embed
  return new Ollama(cfg)
}

/**
 * Collect conversations either from an export archive (--import <path>) or straight
 * from the live machine for the selected sources.
 */
async function collectLive(flags: Parsed['flags']): Promise<Conversation[]> {
  const limit = typeof flags.limit === 'string' ? parseInt(flags.limit, 10) : 0
  let out: Conversation[] = []
  if (typeof flags.import === 'string') {
    out = (await parseExportPath(flags.import)).conversations
  } else {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    const os = process.platform as 'win32' | 'darwin' | 'linux'
    for (const id of resolveSources(flags.sources)) {
      const a = getAdapter(id)
      if (!a?.collectConversations) continue
      const root = a.resolveRoot(os, home)
      if (root) out.push(...(await a.collectConversations(root)))
    }
  }
  return limit > 0 ? out.slice(0, limit) : out
}

async function readNotesDir(dir: string): Promise<{ source: string; notePath: string; text: string }[]> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'))
  const out = []
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), 'utf8')
    const source = /^source:\s*(.+)$/m.exec(text)?.[1]?.trim() || 'note'
    out.push({ source, notePath: f, text })
  }
  return out
}

const INDEX_FILE = '.pomnia-index.json'

async function cmdBrain(p: Parsed): Promise<void> {
  const sub = p.positional[0]
  const ollama = ollamaFrom(p.flags)

  if (sub === 'status') {
    // 1) Ollama (host-side distillation engine)
    const ok = await ollama.reachable()
    console.log(`\n  Ollama @ ${C.cyan(ollama.cfg.baseUrl)} — ${ok ? C.green('reachable') : C.red('offline')}`)
    if (ok) {
      const models = await ollama.listModels()
      console.log(`  ${C.dim('chat:')} ${ollama.cfg.chatModel}  ${C.dim('embed:')} ${ollama.cfg.embedModel}  ${C.dim(`(${models.length} models)`)}`)
    }

    // 2) Brain server (optional — only if --brain or --url passed)
    const brainUrl =
      typeof p.flags.brain === 'string'
        ? String(p.flags.brain).replace(/\/$/, '')
        : typeof p.flags.url === 'string'
          ? String(p.flags.url).replace(/\/$/, '')
          : undefined
    if (brainUrl) {
      const token = typeof p.flags.token === 'string' ? p.flags.token : process.env.BRAIN_TOKEN
      const ping = await pingBrain(brainUrl, token)
      console.log(`\n  Brain  @ ${C.cyan(brainUrl)} — ${ping.reachable ? C.green(`reachable (HTTP ${ping.status})`) : C.red('unreachable')}`)
      if (ping.reachable && ping.data) {
        const s = ping.data as Record<string, unknown>
        const bits = [
          s.notes && `${s.notes} notes`,
          s.sessions && `${s.sessions} sessions`,
          s.library_docs && `${s.library_docs} docs`,
        ].filter(Boolean).join(', ')
        if (bits) console.log(`  ${C.dim(String(bits))}`)
      } else if (ping.error) {
        console.log(`  ${C.dim(ping.error)}`)
      }
    } else {
      console.log(`\n  ${C.dim('Brain — pominięty (podaj --url lub --brain)')}`)
    }

    // 3) MCP clients — what's actually wired
    const clients = await checkAllClients()
    console.log(`\n  MCP clients on this machine:`)
    const dot = (s: string) =>
      s === 'wired' ? C.green('●') : s === 'partial' ? C.yellow('●') : s === 'config_error' ? C.red('●') : C.dim('○')
    for (const c of clients) {
      const tag =
        c.state === 'wired'         ? C.green('wired') :
        c.state === 'partial'       ? C.yellow('partial') :
        c.state === 'config_error'  ? C.red('config error') :
        C.dim('not wired')
      const tokenBit = c.servers.some((s) => s.hasToken) ? C.dim(' [token]') : ''
      console.log(`  ${dot(c.state)} ${c.label.padEnd(28)} ${tag}${tokenBit}`)
      if (c.state === 'wired' || c.state === 'partial') {
        for (const s of c.servers.filter((s) => s.present)) {
          console.log(`      ${C.dim(s.key.padEnd(14))} ${s.url || C.dim('(no url detected)')} ${s.transport ? C.dim('[' + s.transport + ']') : ''}`)
        }
      }
      if (c.state !== 'wired' && c.state !== 'not_wired') {
        for (const i of c.issues) console.log(`      ${C.dim('· ' + i)}`)
      }
    }
    console.log(C.dim(`\n  Tip: \`pomnia brain snippet --client <id>\` to get a copy-paste config.\n`))
    return
  }

  if (sub === 'distill' || sub === 'pipeline') {
    const out = String(p.flags.out || '')
    if (!out) throw new Error('--out <dir> required')
    if (!(await ollama.reachable())) throw new Error(`Ollama offline at ${ollama.cfg.baseUrl}`)
    const convs = await collectLive(p.flags)
    console.log(C.dim(`  distilling ${convs.length} conversation(s) with ${ollama.cfg.chatModel}…`))
    const { notes, skipped } = await distillAll(convs, ollama, undefined, (pr) =>
      process.stdout.write(`\r  ${pr.done}/${pr.total} ${C.dim((pr.detail || '').slice(0, 46))}            `)
    )
    process.stdout.write('\n')
    await deployFilesystem(notes, out)
    const stubs = notes.filter((n) => n.quality === 'stub').length
    const garbage = notes.filter((n) => n.quality === 'garbage').length
    const okNotes = notes.filter((n) => n.quality === 'ok')
    console.log(
      `  ${C.green('✔')} ${okNotes.length} notes → ${out} ${C.dim(`(${stubs} stubs, ${garbage} low-quality → _review/, ${skipped} skipped as too short)`)}`
    )
    if (sub === 'pipeline') {
      const indexNotes = okNotes.map((n) => ({ source: n.source, notePath: n.sessionId, text: n.markdown }))
      const idx = await buildIndex(indexNotes, ollama, (d, t) =>
        process.stdout.write(`\r  indexing ${d}/${t}            `)
      )
      process.stdout.write('\n')
      await saveIndex(idx, path.join(out, INDEX_FILE))
      console.log(`  ${C.green('✔')} indexed ${idx.entries.length} chunks (dim ${idx.dim})`)
    }
    return
  }

  if (sub === 'index') {
    const dir = String(p.flags.notes || '')
    if (!dir) throw new Error('--notes <dir> required')
    if (!(await ollama.reachable())) throw new Error(`Ollama offline at ${ollama.cfg.baseUrl}`)
    const notes = await readNotesDir(dir)
    const idx = await buildIndex(
      notes.map((n) => ({ source: n.source, notePath: n.notePath, text: n.text })),
      ollama,
      (d, t) => process.stdout.write(`\r  indexing ${d}/${t}            `)
    )
    process.stdout.write('\n')
    await saveIndex(idx, path.join(dir, INDEX_FILE))
    console.log(`  ${C.green('✔')} indexed ${idx.entries.length} chunks from ${notes.length} notes (dim ${idx.dim})`)
    return
  }

  if (sub === 'search') {
    const dir = String(p.flags.notes || '')
    const query = p.positional.slice(1).join(' ') || String(p.flags.q || '')
    if (!dir || !query) throw new Error('usage: brain search --notes <dir> "<query>"')
    const idx = await loadIndex(path.join(dir, INDEX_FILE))
    const k = typeof p.flags.k === 'string' ? parseInt(p.flags.k, 10) : 6
    const hits = await searchIndex(idx, query, ollama, k)
    console.log(C.bold(`\n  "${query}" — top ${hits.length}\n`))
    for (const h of hits) {
      console.log(`  ${C.cyan(h.score.toFixed(3))} ${C.dim(h.source)} ${h.notePath}`)
      console.log(`    ${h.text.replace(/\s+/g, ' ').slice(0, 160)}…\n`)
    }
    return
  }

  if (sub === 'snippet') {
    const client = String(p.flags.client || '') as ClientId
    if (!client) {
      const list = listClients()
      console.log(C.bold('\n  Available clients:\n'))
      for (const c of list) console.log(`  ${C.cyan(c.id.padEnd(16))} ${c.label}`)
      console.log(C.dim('\n  Usage: brain snippet --client <id> --url http://brain:7862 [--token btk_…]\n'))
      return
    }
    const url = typeof p.flags.url === 'string' ? String(p.flags.url).replace(/\/$/, '') : ''
    if (!url) {
      console.log(C.red('\n  --url required (np. http://twoj-serwer:7862)\n'))
      return
    }
    const token = typeof p.flags.token === 'string' ? p.flags.token : process.env.BRAIN_TOKEN
    const targetOS = (process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux') as
      | 'win32'
      | 'darwin'
      | 'linux'
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const snip = buildSnippet(client, url, targetOS, home, token)

    console.log(C.bold(`\n  ${snip.label}\n`))
    console.log(snip.instructions)
    console.log()
    console.log(C.bold(`  FULL FILE (paste as entire content if file does not exist):`))
    console.log(C.dim(`  ─────────────────────────────────────────`))
    console.log(snip.fullFileJson)
    console.log(C.bold(`  MERGE (paste inside existing "${snip.mcpKey}" object):`))
    console.log(C.dim(`  ─────────────────────────────────────────`))
    console.log(snip.mergeJson)
    console.log(C.dim(`  Path: ${snip.filePath}\n`))
    return
  }

  if (sub === 'skills') {
    const action = String(p.positional[1] || 'sync')
    const url = String(p.flags.url || p.flags.brain || 'http://localhost:7860').replace(/\/$/, '')
    const target = String(p.flags.target || p.flags.out || path.join(process.cwd(), '.pomnia-skills'))
    const token = typeof p.flags.token === 'string' ? p.flags.token : process.env.BRAIN_TOKEN
    if (action === 'list') {
      const cat = await listAllSkills(url, { token })
      console.log(C.bold(`\n  ${cat.length} skills @ ${url}\n`))
      for (const s of cat) console.log(`  ${C.cyan(s.kind.padEnd(5))} ${s.name}${s.description ? C.dim(' — ' + s.description.slice(0, 80)) : ''}`)
      return
    }
    if (action === 'sync') {
      console.log(C.dim(`  syncing skills from ${url} → ${target}…`))
      const r = await syncSkills(url, target, { token })
      console.log(`  ${C.green('✔')} ${r.written} written, ${r.errors.length} errors`)
      for (const e of r.errors) console.log(`  ${C.yellow('⚠')} ${e.name}: ${e.reason}`)
      return
    }
    throw new Error('usage: brain skills list|sync [--url http://brain:7860] [--target DIR] [--token btk_…]')
  }

  if (sub === 'deploy') {
    const to = String(p.flags.to || 'filesystem')
    if (to === 'filesystem') {
      const dir = String(p.flags.notes || '')
      const target = String(p.flags.target || '')
      if (!dir || !target) throw new Error('filesystem deploy needs --notes <dir> --target <vaultDir>')
      const notes = await readNotesDir(dir)
      await fs.mkdir(target, { recursive: true })
      for (const n of notes) await fs.writeFile(path.join(target, n.notePath), n.text, 'utf8')
      console.log(`  ${C.green('✔')} copied ${notes.length} notes → ${target}`)
    } else if (to === 'dashboard') {
      const url = String(p.flags.url || 'http://localhost:7860')
      const convs = await collectLive(p.flags)
      console.log(C.dim(`  pushing ${convs.length} chats to ${url} (Brain distills)…`))
      const r = await deployDashboard(convs, url)
      console.log(`  ${C.green('✔')} ${r.ok} ok, ${r.failed} failed`)
    } else throw new Error('--to must be filesystem|dashboard')
    if (p.flags.reindex && typeof p.flags.url === 'string') {
      const token = typeof p.flags.token === 'string' ? p.flags.token : process.env.BRAIN_TOKEN
      const ok = await triggerReindex(String(p.flags.url), token)
      console.log(ok ? `  ${C.green('✔')} reindex triggered` : `  ${C.yellow('⚠')} reindex call failed`)
    }
    return
  }

  console.log(`
  ${C.bold('pomnia brain')} — host-side distill + pre-index, then deploy to Brain

  ${C.cyan('status')}   [--ollama URL] [--brain URL] [--token btk_…]   ${C.dim('(ollama + brain ping + which MCP clients are wired)')}
  ${C.cyan('distill')}  --out DIR [--sources all] [--model M] [--limit N] [--ollama URL]
  ${C.cyan('index')}    --notes DIR [--embed M] [--ollama URL]
  ${C.cyan('search')}   --notes DIR "<query>" [--k N]
  ${C.cyan('pipeline')} --out DIR [--sources all] [--model M] [--limit N]   ${C.dim('(distill + index)')}
  ${C.cyan('deploy')}   --to filesystem --notes DIR --target VAULTDIR
  ${C.cyan('deploy')}   --to dashboard  --url http://host:7860 [--reindex]
  ${C.cyan('skills')}   list | sync [--url http://brain:7860] [--target DIR] [--token btk_…]
  ${C.cyan('snippet')}  --client <id> [--url http://brain:7862] [--token btk_…]   ${C.dim('(copy-paste mcp config for one client)')}
`)
}

async function cmdScan(): Promise<void> {
  console.log(C.bold('\n  Pomnia — detected AI assistants\n'))
  const found = await detectAll()
  const rows = found
    .filter((d) => d.installed)
    .map((d) => ({
      Source: d.label,
      Strategy: d.strategy,
      Size: human(d.sizeBytes),
      Chats: d.conversations ?? '—',
      Root: d.root
    }))
  if (!rows.length) {
    console.log(C.dim('  No supported assistants found on this machine.\n'))
    return
  }
  for (const r of rows) {
    console.log(
      `  ${C.green('●')} ${C.bold(r.Source.padEnd(16))} ${C.dim(r.Strategy.padEnd(10))} ${C.cyan(
        String(r.Size).padStart(9)
      )}  ${String('chats:' + r.Chats).padEnd(12)} ${C.dim(r.Root)}`
    )
  }
  console.log()
}

async function cmdBackup(p: Parsed): Promise<void> {
  const dir = String(p.flags.vault || '')
  if (!dir) throw new Error('--vault <dir> required')
  const pass = await getPass(p.flags, p.flags.create === true)
  const vault =
    p.flags.create === true
      ? await Vault.create(dir, String(p.flags.name || 'My Vault'), pass)
      : await Vault.open(dir, pass)
  const sources = resolveSources(p.flags.sources)
  console.log(C.dim(`  Backing up ${sources.length} source(s) → ${dir}`))
  const created = await runBackup(
    vault,
    { sources, note: typeof p.flags.note === 'string' ? p.flags.note : undefined },
    (pr) => process.stdout.write(`\r  ${C.cyan(pr.source)} · ${pr.phase}${pr.detail ? ' · ' + pr.detail : ''}            `)
  )
  process.stdout.write('\n')
  for (const s of created)
    console.log(
      `  ${C.green('✔')} ${C.bold(s.source.label)} — ${s.stats.conversations} chats, ${s.stats.files} files, ${human(
        s.stats.bytes
      )} ${C.dim('(' + s.id.slice(0, 8) + ')')}`
    )
}

async function cmdList(p: Parsed): Promise<void> {
  const dir = String(p.flags.vault || '')
  if (!dir) throw new Error('--vault <dir> required')
  const vault = await Vault.open(dir, await getPass(p.flags))
  const m = vault.getManifest()
  console.log(C.bold(`\n  Vault "${m.name}" — ${m.snapshots.length} snapshot(s)\n`))
  for (const s of m.snapshots) {
    console.log(
      `  ${C.cyan(s.id.slice(0, 8))}  ${s.createdAt.slice(0, 19).replace('T', ' ')}  ${C.bold(
        s.source.label.padEnd(15)
      )} ${String(s.stats.conversations).padStart(4)} chats  ${String(s.stats.files).padStart(5)} files  ${human(
        s.stats.bytes
      ).padStart(9)}  ${C.dim(s.origin.host + ' · ' + s.source.os)}`
    )
  }
  console.log()
}

async function cmdDumpLibrary(p: Parsed): Promise<void> {
  const dir = String(p.flags.vault || '')
  if (!dir) throw new Error('--vault <dir> required')
  const vault = await Vault.open(dir, await getPass(p.flags))
  const docs = vault.getLibraryManifest().documents
  console.log(C.bold(`\n  Library — ${docs.length} document(s)\n`))
  for (const d of docs) {
    const sourcePath = path.join(dir, 'blobs', `${d.sourceBlobSha}.cvb`)
    const extractedPath = path.join(dir, 'blobs', `${d.extractedBlobSha}.cvb`)
    const sourceOk = await fs
      .access(sourcePath)
      .then(() => true)
      .catch(() => false)
    const extractedOk = await fs
      .access(extractedPath)
      .then(() => true)
      .catch(() => false)
    console.log(
      `  ${C.cyan(d.id)}\n` +
        `    name=${d.originalName}  format=${d.format}  pages=${d.pages}\n` +
        `    pendingIndex=${!!d.pendingIndex}  indexedAt=${d.indexedAt ?? '—'}\n` +
        `    sourceBlob=${d.sourceBlobSha.slice(0, 12)}… ${sourceOk ? C.green('ok') : C.red('MISSING')}\n` +
        `    extractedBlob=${d.extractedBlobSha.slice(0, 12)}… ${extractedOk ? C.green('ok') : C.red('MISSING')}`,
    )
  }
  if (docs.length === 0) console.log(C.dim('  (empty library.cvb manifest)\n'))
  else console.log()
}

async function cmdVerify(p: Parsed): Promise<void> {
  const dir = String(p.flags.vault || '')
  if (!dir) throw new Error('--vault <dir> required')
  const vault = await Vault.open(dir, await getPass(p.flags))
  const r = await vault.verify()
  console.log(r.ok ? C.green(`  ✔ vault OK — ${r.checked} blobs verified`) : C.red(`  ✘ ${r.errors.length} error(s)`))
  r.errors.slice(0, 20).forEach((e) => console.log('  ' + C.red(e)))
}

async function cmdBrainExport(p: Parsed): Promise<void> {
  const out = String(p.flags.out || '')
  if (!out) throw new Error('--out <dir> required')
  let conversations
  if (p.flags.vault && p.flags.snapshot) {
    const vault = await Vault.open(String(p.flags.vault), await getPass(p.flags))
    const full = vault.getManifest().snapshots.find((s) => s.id.startsWith(String(p.flags.snapshot)))
    if (!full) throw new Error('snapshot not found')
    conversations = (await vault.getSnapshotPayload(full.id)).conversations
  } else {
    // Export straight from live sources (no vault needed).
    conversations = []
    for (const id of resolveSources(p.flags.sources)) {
      const a = getAdapter(id)
      if (!a?.collectConversations) continue
      const root = a.resolveRoot(process.platform as any, process.env.USERPROFILE || process.env.HOME || '')
      if (root) conversations.push(...(await a.collectConversations(root)))
    }
  }
  const files = await exportConversationsToDir(conversations, out)
  console.log(`  ${C.green('✔')} exported ${files.length} conversation note(s) → ${out}`)
}

async function cmdImport(p: Parsed): Promise<void> {
  const inPath = String(p.flags.in || p.flags.import || p.positional[0] || '')
  if (!inPath) throw new Error('usage: import --in <file|dir> [--out <dir>]')
  const r = await parseExportPath(inPath)
  console.log(C.bold(`\n  Import — detected: ${r.detected}\n`))
  for (const [src, n] of Object.entries(r.perSource)) console.log(`  ${C.cyan(src.padEnd(12))} ${n} conversations`)
  console.log(`  ${C.dim('total')} ${C.bold(String(r.conversations.length))}\n`)
  if (typeof p.flags.out === 'string') {
    const files = await exportConversationsToDir(r.conversations, p.flags.out)
    console.log(`  ${C.green('✔')} wrote ${files.length} transcript notes → ${p.flags.out}`)
    console.log(C.dim(`  distill them with:  brain pipeline --import "${inPath}" --out <dir>\n`))
  }
}

function help(): void {
  console.log(`
${C.bold('Pomnia')} — encrypted, cross-platform backup for AI assistant chats

  ${C.cyan('scan')}                                   detect installed assistants
  ${C.cyan('backup')}  --vault DIR [--create] [--name N] [--sources all|a,b] [--note "…"]
  ${C.cyan('list')}    --vault DIR
  ${C.cyan('dump-library')} --vault DIR                 list library.cvb docs + blob presence
  ${C.cyan('verify')}  --vault DIR
  ${C.cyan('brain-export')} --out DIR [--vault DIR --snapshot ID | --sources all]
  ${C.cyan('import')} --in FILE|DIR [--out DIR]            parse Claude.ai/ChatGPT/Grok/Gemini exports
  ${C.cyan('brain')} <status|distill|index|search|pipeline|deploy> [--import PATH]   host-side distill → Brain

  Passphrase: --pass, or $POMNIA_PASS (legacy: $RELIQUA_PASS), or interactive prompt.
  Ollama:     --ollama URL or $POMNIA_OLLAMA (legacy: $RELIQUA_OLLAMA, default http://localhost:11434).
`)
}

async function main(): Promise<void> {
  const p = parse(process.argv.slice(2))
  try {
    switch (p.cmd) {
      case 'scan': return await cmdScan()
      case 'backup': return await cmdBackup(p)
      case 'list': return await cmdList(p)
      case 'dump-library': return await cmdDumpLibrary(p)
      case 'verify': return await cmdVerify(p)
      case 'brain-export': return await cmdBrainExport(p)
      case 'brain': return await cmdBrain(p)
      case 'import': return await cmdImport(p)
      default: return help()
    }
  } catch (e) {
    console.error(C.red(`\n  error: ${(e as Error).message}\n`))
    process.exit(1)
  }
}

main()
