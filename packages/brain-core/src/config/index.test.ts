import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadConfig } from './index.js'

/**
 * This file parses everything an operator types, and until now it had no test
 * at all. The two bugs it is written against both cost a working server:
 *
 *  - a port nobody could see (the daemon fell back to a default while the
 *    operator had published a different one, and every probe agreed it was fine)
 *  - a URL that killed the process instead of degrading it
 */

const base = ['--data-dir', '/tmp/pomnia-cfg-test']
let errors: string[] = []

beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

describe('port', () => {
  it('takes a valid port from the flag', async () => {
    const cfg = await loadConfig([...base, '--port', '7865'], {})
    expect(cfg.port).toBe(7865)
  })

  it('takes it from the environment when no flag is given', async () => {
    const cfg = await loadConfig([...base], { BRAIN_PORT: '7865' } as NodeJS.ProcessEnv)
    expect(cfg.port).toBe(7865)
  })

  it('lets the flag win over the environment', async () => {
    const cfg = await loadConfig([...base, '--port', '7999'], {
      BRAIN_PORT: '7865',
    } as NodeJS.ProcessEnv)
    expect(cfg.port).toBe(7999)
  })

  /** Number('abc') is NaN and reaches listen() as ERR_SOCKET_BAD_PORT, which
   *  names neither the flag nor the value the operator actually typed. */
  it.each(['abc', '', '0', '-1', '65536', '80.5'])('refuses %o and says so', async (bad) => {
    await expect(loadConfig([...base, '--port', bad], {})).rejects.toThrow(/--port/)
  })

  it('names the environment variable when that is the bad one', async () => {
    await expect(
      loadConfig([...base], { BRAIN_PORT: 'nope' } as NodeJS.ProcessEnv),
    ).rejects.toThrow(/BRAIN_PORT/)
  })
})

describe('unknown arguments', () => {
  /**
   * A misspelt flag used to be indistinguishable from one never passed: both
   * left the default in place, silently. That is exactly how a server ends up
   * on a port its operator did not choose.
   */
  it('warns about a typo instead of ignoring it', async () => {
    await loadConfig([...base, '--prot', '7865'], {})
    expect(errors.join('\n')).toMatch(/unknown argument: --prot/)
  })

  it('still applies the flags that are spelled correctly', async () => {
    const cfg = await loadConfig([...base, '--prot', '7865', '--host', '0.0.0.0'], {})
    expect(cfg.host).toBe('0.0.0.0')
  })

  it('does not warn about the flags daemon.ts handles itself', async () => {
    await loadConfig([...base, '--reindex', '--claim-vault'], {})
    expect(errors.join('\n')).not.toMatch(/unknown argument/)
  })
})

describe('Ollama URL', () => {
  it('keeps a good URL', async () => {
    const cfg = await loadConfig([...base, '--ollama-url', 'http://127.0.0.1:11434'], {})
    expect(cfg.ollamaUrl).toBe('http://127.0.0.1:11434')
    expect(cfg.ollamaUrlError).toBeUndefined()
  })

  /**
   * The unit file argues its own case for this: it declares no ordering on
   * Ollama because "refusing to start would turn a partial outage into a full
   * one". Throwing here did precisely that — and with Restart=on-failure plus
   * StartLimitBurst=5, one bad URL retired the service permanently.
   */
  it('starts without embeddings rather than refusing to start', async () => {
    const cfg = await loadConfig([...base, '--ollama-url', 'http://169.254.169.254'], {})
    expect(cfg.ollamaUrlError).toBeTruthy()
    expect(errors.join('\n')).toMatch(/REFUSED Ollama URL/)
  })

  /** Refused means not fetched: the address must not survive into the config. */
  it('blanks the refused address so nothing can request it', async () => {
    const cfg = await loadConfig([...base, '--ollama-url', 'http://169.254.169.254'], {})
    expect(cfg.ollamaUrl).toBe('')
  })

  it('refuses credentials in the URL', async () => {
    const cfg = await loadConfig([...base, '--ollama-url', 'http://u:p@ollama.local:11434'], {})
    expect(cfg.ollamaUrlError).toBeTruthy()
  })
})

describe('paths derived from --data-dir', () => {
  /** Without this the vault and db moved but tokens were still read from the
   *  home directory, so a server looked authenticated against a file nobody
   *  had deployed. */
  it('follows the tokens file to the data dir', async () => {
    const cfg = await loadConfig(['--data-dir', '/srv/pomnia'], {})
    expect(cfg.auth.tokensFile.replace(/\\/g, '/')).toBe('/srv/pomnia/mcp-tokens.json')
  })

  it('leaves an explicit --tokens-file alone', async () => {
    const cfg = await loadConfig(
      ['--data-dir', '/srv/pomnia', '--tokens-file', '/etc/pomnia/tokens.json'],
      {},
    )
    expect(cfg.auth.tokensFile).toBe('/etc/pomnia/tokens.json')
  })
})
