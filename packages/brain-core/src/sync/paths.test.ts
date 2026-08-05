import { describe, expect, it } from 'vitest'

import { safeVaultPath, SYNC_DIRS, SYNC_ROOT_FILES } from './paths.js'

const ok = (p: string): string => {
  const v = safeVaultPath(p)
  expect(v, `expected ${JSON.stringify(p)} to be accepted`).toMatchObject({ ok: true })
  return (v as { relative: string }).relative
}

const rejected = (p: string): string => {
  const v = safeVaultPath(p)
  expect(v.ok, `expected ${JSON.stringify(p)} to be REJECTED`).toBe(false)
  return (v as { reason: string }).reason
}

describe('safeVaultPath — what it accepts', () => {
  it('takes ordinary vault notes', () => {
    expect(ok('sessions/2026-08-05_claude-code_topic_13-16.md')).toBe(
      'sessions/2026-08-05_claude-code_topic_13-16.md',
    )
    ok('distilled/note.md')
    ok('state/distill-ledger.json')
    ok('skills/brain/build-our-way/SKILL.md')
  })

  it('takes the two root files', () => {
    for (const f of SYNC_ROOT_FILES) ok(f)
  })

  it('takes every declared sync dir', () => {
    for (const d of SYNC_DIRS) ok(`${d}/x.md`)
  })

  /** Polish filenames are the norm here, not an edge case. */
  it('takes Polish characters, spaces and parentheses', () => {
    ok('notes/Wdrożenie serwera (kopia).md')
    ok('digests/podsumowanie-tygodnia_ąćęłńóśźż.md')
  })

  /**
   * Real filenames from the live vault. An allow-list of Polish letters refused
   * all three on the first end-to-end run — a script an author does not write
   * in is not a path problem, and refusing it makes the tool provincial.
   */
  it('takes scripts nobody thought to list', () => {
    ok('distilled/2025-04-16_grok_Optymalizacja_indykatora_ꜱᴇʀᴜᴍ_ᴛᴏᴏʟᴋɪᴛ_9e994bea.md')
    ok('distilled/2025-11-04_claude-ai_Electric_heating_system_for_50m²_silicat_9ecdc994.md')
    ok('distilled/_weak/2025-03-24_grok_Volatilitas_Bandları_ve_Hesaplama_3122e6aa.md')
    ok('notes/日本語のノート.md')
    ok('notes/заметка.md')
    ok('notes/ملاحظة.md')
  })
})

describe('safeVaultPath — traversal', () => {
  it('rejects every shape of ..', () => {
    for (const p of [
      '../etc/passwd',
      'sessions/../../etc/passwd',
      'sessions/../../../root/.ssh/authorized_keys.md',
      '..',
      'sessions/..',
      './sessions/x.md',
      'sessions/./x.md',
    ]) {
      rejected(p)
    }
  })

  it('rejects absolute paths on both platforms', () => {
    expect(rejected('/etc/passwd')).toBe('absolute')
    expect(rejected('/sessions/x.md')).toBe('absolute')
    expect(rejected('C:/Windows/System32/drivers/etc/hosts')).toBe('absolute')
    expect(rejected('c:sessions/x.md')).toBe('absolute')
  })

  /**
   * A POSIX-only check would pass `sessions\..\..\x` straight through and then
   * Windows would happily resolve it.
   */
  it('rejects backslashes outright rather than reasoning about them', () => {
    expect(rejected('sessions\\x.md')).toBe('backslash')
    expect(rejected('sessions\\..\\..\\x.md')).toBe('backslash')
    expect(rejected('\\\\192.168.1.150\\Projekty\\x.md')).toBe('backslash')
  })

  it('rejects UNC and scheme-ish inputs', () => {
    rejected('//192.168.1.150/Projekty/x.md')
    rejected('file:///etc/passwd')
    rejected('http://evil/x.md')
  })
})

describe('safeVaultPath — the deny-by-default boundary', () => {
  it('refuses directories that are not on the list', () => {
    expect(rejected('blobs/deadbeef')).toBe('not-synced-dir')
    expect(rejected('snapshots/x.json')).toBe('not-synced-dir')
    expect(rejected('.git/config')).toBe('not-synced-dir')
    expect(rejected('node_modules/x.json')).toBe('not-synced-dir')
  })

  /** Blobs are 2.51 GB the replica's RAG never reads. */
  it('refuses blobs specifically', () => {
    expect(SYNC_DIRS).not.toContain('blobs')
    rejected('blobs/ab/cdef.bin')
  })

  it('refuses arbitrary root files', () => {
    expect(rejected('header.json')).toBe('not-synced-dir')
    expect(rejected('.env')).toBe('not-synced-dir')
    expect(rejected('x.md')).toBe('not-synced-dir')
  })

  it('refuses a bare sync dir with no file under it', () => {
    expect(rejected('sessions')).toBe('not-synced-dir')
    expect(rejected('sessions/')).toBe('traversal')
  })

  it('refuses executables and anything not text-ish', () => {
    expect(rejected('sessions/x.exe')).toBe('bad-extension')
    expect(rejected('skills/brain/run.sh')).toBe('bad-extension')
    expect(rejected('state/x.db')).toBe('bad-extension')
    expect(rejected('notes/x')).toBe('bad-extension')
  })
})

describe('safeVaultPath — Windows filename traps', () => {
  it('rejects trailing dot or space, which Windows silently strips', () => {
    // `sessions/x.md ` and `sessions/x.md` are the same file to Win32 — a
    // rename the sender never asked for.
    expect(rejected('sessions/x.md ')).toBe('illegal-char')
    rejected('sessions/sub./x.md')
  })

  it('rejects control characters, which truncate paths in some syscalls', () => {
    expect(rejected('sessions/x\u0000.md')).toBe('illegal-char')
    expect(rejected('sessions/x\u001f.md')).toBe('illegal-char')
    expect(rejected('sessions/x\u007f.md')).toBe('illegal-char')
  })

  it('rejects stream and wildcard syntax', () => {
    rejected('sessions/x.md:stream')
    rejected('sessions/*.md')
    rejected('sessions/x?.md')
    rejected('sessions/x|y.md')
    rejected('sessions/x<y.md')
    rejected('sessions/x>y.md')
    rejected('sessions/x"y.md')
  })

  /** `nul.md` is not a file on Windows — it is the null device. */
  it('rejects reserved device names', () => {
    expect(rejected('sessions/nul.md')).toBe('illegal-char')
    expect(rejected('sessions/CON.md')).toBe('illegal-char')
    expect(rejected('sessions/com1.md')).toBe('illegal-char')
    expect(rejected('notes/lpt9.txt')).toBe('illegal-char')
    // Not reserved — only the exact device names are.
    ok('sessions/console.md')
    ok('sessions/nullify.md')
  })
})

describe('safeVaultPath — shape', () => {
  it('rejects empty and whitespace', () => {
    expect(rejected('')).toBe('empty')
    expect(rejected('   ')).toBe('empty')
  })

  it('rejects paths deeper than a vault layout goes', () => {
    expect(rejected('skills/a/b/c/d/e/f/g.md')).toBe('too-deep')
  })

  it('never returns a path different from what was accepted', () => {
    for (const p of ['sessions/a.md', 'skills/brain/x/SKILL.md', 'USER.md']) {
      expect(ok(p)).toBe(p)
    }
  })
})
