/**
 * Rebuild manifest.cvb from the snapshots that survive on disk.
 *
 * Why this exists: atomicWrite() renames a temp file into place, which is atomic
 * against other readers and says nothing about power loss. The rename is a
 * metadata operation and lands in the filesystem journal almost immediately; the
 * file's *contents* sit in the page cache until the OS decides to flush them.
 * Pull the plug in between and the file comes back at the right size, full of
 * zeros. That is exactly what happened here: 55088 bytes, not one of them
 * non-zero.
 *
 * What is lost and what is not. manifest.cvb holds the list of snapshots and
 * their stats — an index. The snapshots themselves are separate files named by
 * id, the blobs are content-addressed, and the notes are plaintext markdown that
 * was never inside the encrypted store at all. So the memory is intact; the
 * table of contents is not, and it can be rebuilt by reading what it indexed.
 *
 * Some fields cannot be recovered, only inferred, and this says which:
 *   createdAt   file mtime — close to the truth, not the recorded value
 *   source      read back from the conversations inside each snapshot
 *   note        gone; there is nowhere else it was written
 *
 * Usage — the passphrase is typed here and never passed as an argument, because
 * arguments are visible in `ps` and land in shell history:
 *
 *   npx tsx scripts/repair-vault-manifest.ts C:\Vault            # dry run
 *   npx tsx scripts/repair-vault-manifest.ts C:\Vault --write    # actually write
 */
import { createInterface } from 'node:readline'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  CHECK_PLAINTEXT,
  decrypt,
  decryptJSON,
  deriveKey,
  encryptJSON,
} from '../src/core/crypto.js'
import type { Snapshot, VaultManifest } from '../src/core/model.js'
import type { SnapshotPayload } from '../src/core/vault.js'

/** Declared here because vault.ts keeps it private — same shape, read-only use. */
interface VaultHeader {
  formatVersion: 1
  vaultId: string
  name: string
  createdAt: string
  kdf: { algo: 'scrypt'; salt: string; N: number; r: number; p: number }
  check: string
}

const MAGIC = Buffer.from('CVB1', 'ascii')

const dir = process.argv[2]
const write = process.argv.includes('--write')
/**
 * Survey the damage without the passphrase.
 *
 * Whether a file survived is a question about its first four bytes, not about
 * its contents — so the count, the dates and the size of what is recoverable can
 * all be established before anyone types a secret. Somebody deciding whether to
 * attempt a repair on their own memory deserves the numbers first.
 */
const inspect = process.argv.includes('--inspect')

if (!dir) {
  console.error('usage: tsx scripts/repair-vault-manifest.ts <vault-dir> [--write]')
  process.exit(2)
}

/** Prompt without echoing. A passphrase on a screen is a passphrase in a photo. */
async function askPassphrase(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  const stdin = process.stdin as NodeJS.ReadStream & { isTTY?: boolean }
  const wasRaw = stdin.isTTY
  process.stdout.write('Hasło do vaultu (nie będzie widoczne): ')
  const original = (rl as unknown as { _writeToOutput?: (s: string) => void })._writeToOutput
  ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {}
  const answer = await new Promise<string>((resolve) => rl.question('', resolve))
  if (original) (rl as unknown as { _writeToOutput: unknown })._writeToOutput = original
  rl.close()
  process.stdout.write('\n')
  void wasRaw
  return answer
}

/** Write, flush to the platter, then rename — the step whose absence caused this. */
async function durableWrite(file: string, data: Buffer): Promise<void> {
  const tmp = `${file}.repair.tmp`
  const fh = await fs.open(tmp, 'w')
  try {
    await fh.writeFile(data)
    await fh.sync()
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, file)
  // The rename itself needs the directory entry on disk too.
  const dh = await fs.open(path.dirname(file), 'r')
  try {
    await dh.sync()
  } catch {
    // Directory fsync is not permitted on every platform; the file sync above
    // is the part that matters for the failure this repairs.
  } finally {
    await dh.close()
  }
}

async function main(): Promise<void> {
  const header: VaultHeader = JSON.parse(await fs.readFile(path.join(dir, 'header.json'), 'utf8'))
  console.log(`vault "${header.name}" · utworzony ${header.createdAt}`)

  if (inspect) {
    const snapDir = path.join(dir, 'snapshots')
    const files = (await fs.readdir(snapDir)).filter((f) => f.endsWith('.cvb'))
    let good = 0
    const badFiles: string[] = []
    let oldest = ''
    let newest = ''
    let bytes = 0
    for (const f of files) {
      const abs = path.join(snapDir, f)
      const raw = await fs.readFile(abs)
      const st = await fs.stat(abs)
      if (raw.length >= 4 && raw.subarray(0, 4).equals(MAGIC)) {
        good++
        bytes += st.size
        const iso = st.mtime.toISOString()
        if (!oldest || iso < oldest) oldest = iso
        if (!newest || iso > newest) newest = iso
      } else {
        badFiles.push(f)
      }
    }
    console.log(`snapshoty na dysku  : ${files.length}`)
    console.log(`  do odzyskania     : ${good}  (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
    console.log(`  nie do odzyskania : ${badFiles.length}`)
    for (const f of badFiles) console.log(`     ${f}`)
    if (good) console.log(`zakres dat          : ${oldest.slice(0, 10)} … ${newest.slice(0, 10)}`)
    console.log('\nTo wszystko, co da się stwierdzić bez hasła — czy plik jest cały,')
    console.log('a nie co w nim jest. Żeby odbudować manifest, uruchom bez --inspect.')
    return
  }

  const passphrase = await askPassphrase()
  const key = deriveKey(passphrase, Buffer.from(header.kdf.salt, 'base64'), header.kdf)
  try {
    const got = decrypt(key, Buffer.from(header.check, 'base64'))
    if (!got.equals(CHECK_PLAINTEXT)) throw new Error('mismatch')
  } catch {
    console.error('✗ Złe hasło — nic nie zostało zmienione.')
    process.exit(1)
  }
  console.log('✔ hasło poprawne\n')

  const snapDir = path.join(dir, 'snapshots')
  const files = (await fs.readdir(snapDir)).filter((f) => f.endsWith('.cvb'))

  const snapshots: Snapshot[] = []
  const damaged: string[] = []

  for (const file of files.sort()) {
    const abs = path.join(snapDir, file)
    const raw = await fs.readFile(abs)
    if (raw.length < 4 || !raw.subarray(0, 4).equals(MAGIC)) {
      damaged.push(file)
      continue
    }
    let payload: SnapshotPayload
    try {
      payload = decryptJSON<SnapshotPayload>(key, raw)
    } catch (e) {
      damaged.push(`${file} (${(e as Error).message})`)
      continue
    }
    const st = await fs.stat(abs)
    const conversations = payload.conversations ?? []
    const capturedFiles = payload.files ?? []
    const messages = conversations.reduce((n, c) => n + (c.messages?.length ?? 0), 0)
    const bytes = capturedFiles.reduce((n, f) => n + (f.bytes ?? 0), 0)
    // Only conversations carry a source; CaptureItem does not. A snapshot of
    // files alone therefore cannot say where it came from, and saying "unknown"
    // is better than picking one.
    const sourceId = conversations[0]?.source ?? 'unknown'

    snapshots.push({
      id: file.replace(/\.cvb$/, ''),
      createdAt: st.mtime.toISOString(),
      source: {
        id: sourceId as Snapshot['source']['id'],
        label: String(sourceId),
        strategy: 'snapshot',
        root: '(odtworzone — oryginał był w manifeście)',
        os: process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux',
      },
      stats: { conversations: conversations.length, messages, files: capturedFiles.length, bytes },
      note: undefined,
    } as Snapshot)
  }

  snapshots.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  console.log(`odczytane snapshoty : ${snapshots.length}`)
  console.log(`nieczytelne         : ${damaged.length}`)
  for (const d of damaged) console.log(`   ${d}`)
  const totalMsgs = snapshots.reduce((n, s) => n + s.stats.messages, 0)
  const totalFiles = snapshots.reduce((n, s) => n + s.stats.files, 0)
  console.log(`razem w odzyskanych : ${totalMsgs} wiadomości, ${totalFiles} plików`)
  if (snapshots.length) {
    console.log(`zakres dat          : ${snapshots[0].createdAt} … ${snapshots[snapshots.length - 1].createdAt}`)
  }

  const manifest: VaultManifest = {
    formatVersion: 1,
    vaultId: header.vaultId,
    createdAt: header.createdAt,
    name: header.name,
    snapshots,
  } as VaultManifest

  if (!write) {
    console.log('\n(próba na sucho — nic nie zapisano. Dodaj --write, żeby naprawić.)')
    return
  }

  const target = path.join(dir, 'manifest.cvb')
  const backup = `${target}.zeroed-${Date.now()}`
  await fs.rename(target, backup)
  console.log(`\nzepsuty manifest odłożony na bok → ${path.basename(backup)}`)

  await durableWrite(target, encryptJSON(key, manifest))
  console.log(`✔ zapisany nowy manifest.cvb z ${snapshots.length} snapshotami (z fsync)`)
  console.log('  Otwórz teraz vault w Pomni.')
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`)
  process.exit(1)
})
