import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * The release scripts themselves, which nothing was testing.
 *
 * `scripts/lib/release-assets.ts` has had tests since it was extracted, and
 * they pass whatever the scripts around it do — reverting all three of
 * attach-linux-release, attach-win-release and publish-release to their
 * pre-hardening state leaves that suite green at 11/11. The library was
 * guarded; the callers were not.
 *
 * That gap is not theoretical. `promote-release.mjs` shipped calling its own
 * completeness gate through `npx`, which on Windows is a `.cmd` shim and not
 * an executable: `execFileSync` threw ENOENT, the catch reported a complete
 * release as incomplete, and the gate never ran once. It was found by
 * publishing a release, not by a test. Auditing the fixes afterwards turned up
 * two more copies of the same call in the two scripts above.
 *
 * So this file asserts the properties that would have caught it, about the
 * scripts as text — no spawning, no network, nothing that needs a release to
 * exist.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scriptsDir = join(root, 'scripts')

const releaseScripts = readdirSync(scriptsDir)
  .filter((f) => /^(attach-.*|publish-release|promote-release|check-release-complete)\.mjs$/.test(f))
  .map((f) => ({ name: f, text: readFileSync(join(scriptsDir, f), 'utf8') }))

describe('release scripts', () => {
  it('finds the scripts it is meant to be guarding', () => {
    // A rename would otherwise turn this whole file into a silent no-op.
    const names = releaseScripts.map((s) => s.name)
    expect(names).toContain('publish-release.mjs')
    expect(names).toContain('promote-release.mjs')
    expect(names).toContain('check-release-complete.mjs')
    expect(names.length).toBeGreaterThanOrEqual(4)
  })

  it.each(releaseScripts.map((s) => s.name))(
    '%s never shells out through npx or npm',
    (name) => {
      const { text } = releaseScripts.find((s) => s.name === name)!
      // Strip comments so the explanation of this very bug does not trip it.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

      expect(code).not.toMatch(/execFileSync\(\s*['"`]npx['"`]/)
      expect(code).not.toMatch(/execFileSync\(\s*['"`]npm['"`]/)
      expect(code).not.toMatch(/spawnSync\(\s*['"`]npx['"`]/)
    }
  )

  it('runs sibling scripts through this same Node, so the child actually starts', () => {
    for (const { name, text } of releaseScripts) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      // Only scripts that delegate to another script are in scope here.
      if (!/scripts['"`]?,\s*['"`](check-release-complete|promote-release)\.mjs/.test(code)) continue
      expect(code, `${name} must invoke the child with process.execPath`).toMatch(
        /execFileSync\(\s*\n?\s*process\.execPath/
      )
    }
  })

  it('keeps the draft-first rule: nothing undrafts without the completeness check', () => {
    const promote = releaseScripts.find((s) => s.name === 'promote-release.mjs')!.text
    const undraftAt = promote.indexOf('--draft=false')
    const checkAt = promote.indexOf('check-release-complete')

    expect(undraftAt, 'promote-release must be the script that undrafts').toBeGreaterThan(-1)
    expect(checkAt, 'and it must run the completeness check').toBeGreaterThan(-1)
    expect(checkAt, 'the check has to come before the undraft, not after').toBeLessThan(undraftAt)
  })

  it('packs Mini on the release:win version without a second bump', () => {
    const win = readFileSync(join(scriptsDir, 'release-win.mjs'), 'utf8')
    const mini = readFileSync(join(scriptsDir, 'release-mini.mjs'), 'utf8')
    const miniCode = mini.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    expect(win).toContain('npm run release:mini -- --pack-only')
    expect(miniCode).not.toMatch(/npm version/)
    expect(miniCode).not.toMatch(/pack:mini:portable/)
    expect(miniCode).not.toMatch(/\bpack:win\b/)
    expect(miniCode).not.toMatch(/\bbuild:win\b/)
    expect(mini).toContain('pack:mini:zip')
    expect(mini).toContain('build:mini:bundle')
    expect(mini).toContain("process.platform !== 'win32'")

    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    expect(pkg.scripts['build:mini:bundle']).toBe('electron-vite build --mode mini')
    expect(pkg.scripts['release:mini']).toBe('tsx scripts/release-mini.mjs')
    expect(pkg.scripts['attach:mini-release']).toBe('tsx scripts/attach-mini-release.mjs')
  })

  it('never forces a push or rewrites a tag', () => {
    for (const { name, text } of releaseScripts) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code, `${name}`).not.toMatch(/--force\b/)
      expect(code, `${name}`).not.toMatch(/push\b.*\s-f\b/)
    }
  })
})
