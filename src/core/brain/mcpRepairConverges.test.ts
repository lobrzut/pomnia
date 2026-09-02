import { describe, expect, it } from 'vitest'

import { repairReason } from './mcpRepair.js'
import { __testPickUrl } from './status.js'

/**
 * A repair that never converges rewrites a user's config on a timer.
 *
 * Observed in the wild: 107 rewrites of claude_desktop_config.json in one day,
 * every one of them `from` and `to` identical. The block on disk was the block
 * this app writes — correct in every respect — and the detector kept declaring
 * a defect, so the writer kept "fixing" it into exactly the same bytes.
 *
 * The rule this locks down: whatever the writer produces, the detector must
 * accept. Anything else is an infinite loop through someone else's file.
 */
describe('repairReason converges on what Pomnia itself writes', () => {
  const ctx = { brainUrl: 'http://192.168.1.248:7865/mcp', target: 'remote' as const, os: 'win32' as const }

  it('accepts the Windows stdio block this app writes', () => {
    // Verbatim from a live claude_desktop_config.json, token replaced.
    const entry = {
      command: 'cmd',
      args: [
        '/c',
        'npx',
        '-y',
        'mcp-remote',
        'http://192.168.1.248:7865/mcp',
        '--allow-http',
        '--header',
        'Authorization:${AUTH_HEADER}',
      ],
      env: { AUTH_HEADER: 'Bearer btk_TESTTOKEN' },
    }
    const found = { url: 'http://192.168.1.248:7865/mcp', token: 'btk_TESTTOKEN' }
    expect(repairReason(entry, found, ctx)).toBeNull()
  })

  it('accepts it when the brain URL is given without the /mcp suffix', () => {
    // What main actually passes: the address from settings, which is the bare
    // origin. If sameBrain() treats that as a different brain, every sync
    // declares 'points-elsewhere' and rewrites the identical block again.
    const entry = {
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'mcp-remote', 'http://192.168.1.248:7865/mcp', '--allow-http'],
      env: { AUTH_HEADER: 'Bearer btk_TESTTOKEN' },
    }
    const found = { url: 'http://192.168.1.248:7865/mcp', token: 'btk_TESTTOKEN' }
    expect(
      repairReason(entry, found, { ...ctx, brainUrl: 'http://192.168.1.248:7865' }),
    ).toBeNull()
  })

  it('reads the URL out of the block it writes on Windows', () => {
    // The whole loop in one assertion. The reader required `command: npx`,
    // while the writer emits `cmd /c npx` -- this app's own fix for the space
    // in C:\Program Files. So it could not read its own output, reported
    // 'no-url', and rewrote the file again. Measured on a live install: 107
    // rewrites in a day, every one logged as X -> X.
    const written = {
      command: 'cmd',
      args: [
        '/c',
        'npx',
        '-y',
        'mcp-remote',
        'http://192.168.1.248:7865/mcp',
        '--allow-http',
        '--header',
        'Authorization:${AUTH_HEADER}',
      ],
      env: { AUTH_HEADER: 'Bearer btk_TESTTOKEN' },
    }
    const found = __testPickUrl(written)
    expect(found.url).toBe('http://192.168.1.248:7865/mcp')
    expect(found.token).toBe('btk_TESTTOKEN')
    // And with what the reader really returns, the detector finds no defect.
    expect(repairReason(written, { url: found.url, token: found.token }, ctx)).toBeNull()
  })

  it('still reads the older npx-direct shape', () => {
    const older = { command: 'npx', args: ['-y', 'mcp-remote', 'http://h:7865/mcp'] }
    expect(__testPickUrl(older).url).toBe('http://h:7865/mcp')
  })

  it('accepts the plain http block', () => {
    const entry = {
      type: 'http',
      url: 'http://192.168.1.248:7865/mcp',
      headers: { Authorization: 'Bearer btk_TESTTOKEN' },
    }
    const found = { url: 'http://192.168.1.248:7865/mcp', token: 'btk_TESTTOKEN' }
    expect(repairReason(entry, found, ctx)).toBeNull()
  })

  it('still reports the two Windows faults it exists to fix', () => {
    // Convergence must not be bought by making the detector blind.
    const npxDirect = {
      command: 'npx',
      args: ['-y', 'mcp-remote', 'http://192.168.1.248:7865/mcp'],
    }
    const found = { url: 'http://192.168.1.248:7865/mcp', token: 'btk_TESTTOKEN' }
    expect(repairReason(npxDirect, found, ctx)?.reason).toBe('windows-npx-path')

    const spacedHeader = {
      command: 'cmd',
      args: ['/c', 'npx', 'mcp-remote', 'http://x/mcp', '--header', 'Authorization: Bearer btk_x'],
    }
    expect(repairReason(spacedHeader, found, ctx)?.reason).toBe('windows-header-space')
  })

  it('still reports a block pointing somewhere else, or carrying no token', () => {
    const elsewhere = { type: 'http', url: 'http://127.0.0.1:7862/mcp' }
    expect(repairReason(elsewhere, { url: 'http://127.0.0.1:7862/mcp', token: 'x' }, ctx)?.reason).toBe(
      'points-elsewhere',
    )
    const noToken = { type: 'http', url: 'http://192.168.1.248:7865/mcp' }
    expect(repairReason(noToken, { url: 'http://192.168.1.248:7865/mcp' }, ctx)?.reason).toBe('no-token')
  })
})
