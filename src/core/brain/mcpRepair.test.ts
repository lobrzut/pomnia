import { describe, expect, it } from 'vitest'

import { repairReason } from './mcpRepair.js'

const REMOTE = { brainUrl: 'http://192.168.1.248:7865', target: 'remote' as const, os: 'win32' as const }
const ok = { url: 'http://192.168.1.248:7865/mcp', token: 'btk_x' }

describe('repairReason — rewrite on a defect, never on a difference', () => {
  it('leaves a working http entry alone', () => {
    expect(repairReason({ url: ok.url, headers: { Authorization: 'Bearer btk_x' } }, ok, REMOTE)).toBeNull()
  })

  it('leaves a hand-edited entry alone when it still works', () => {
    // The regression this file exists to prevent: comparing against what the
    // generator would write flattens somebody's deliberate edit at the next
    // status check.
    const handEdited = {
      url: ok.url,
      headers: { Authorization: 'Bearer btk_x', 'X-Note': 'mine' },
      timeout: 30000,
    }
    expect(repairReason(handEdited, ok, REMOTE)).toBeNull()
  })

  it('repairs a missing block', () => {
    expect(repairReason(undefined, {}, REMOTE)?.reason).toBe('missing')
  })

  it('repairs an entry aimed at another host', () => {
    const v = repairReason({ url: 'http://192.168.1.99:7865/mcp' }, { url: 'http://192.168.1.99:7865/mcp', token: 'btk_x' }, REMOTE)
    expect(v?.reason).toBe('points-elsewhere')
  })

  it('repairs a remote entry with no token', () => {
    expect(repairReason({ url: ok.url }, { url: ok.url }, REMOTE)?.reason).toBe('no-token')
  })

  it('does not demand a token for an embedded brain', () => {
    const embedded = { brainUrl: 'http://127.0.0.1:7862', target: 'embedded' as const, os: 'win32' as const }
    const found = { url: 'http://127.0.0.1:7862/mcp' }
    expect(repairReason({ url: found.url }, found, embedded)).toBeNull()
  })

  it('repairs the Windows npx path fault', () => {
    // `command: npx` resolves to C:\Program Files\nodejs\npx and cmd.exe splits
    // it on the space: 'C:\Program' is not recognized.
    const v = repairReason(
      { command: 'npx', args: ['-y', 'mcp-remote', ok.url, '--header', 'Authorization:${AUTH_HEADER}'], env: { AUTH_HEADER: 'Bearer btk_x' } },
      ok,
      REMOTE,
    )
    expect(v?.reason).toBe('windows-npx-path')
  })

  it('repairs the Windows header-space fault', () => {
    const v = repairReason(
      { command: 'cmd', args: ['/c', 'npx', '-y', 'mcp-remote', ok.url, '--header', 'Authorization: Bearer btk_x'] },
      ok,
      REMOTE,
    )
    expect(v?.reason).toBe('windows-header-space')
  })

  it('leaves the shape this app writes for Windows alone', () => {
    const good = {
      command: 'cmd',
      args: ['/c', 'npx', '-y', 'mcp-remote', ok.url, '--allow-http', '--header', 'Authorization:${AUTH_HEADER}'],
      env: { AUTH_HEADER: 'Bearer btk_x' },
    }
    expect(repairReason(good, ok, REMOTE)).toBeNull()
  })

  it('does not treat the same brain reached by another local name as elsewhere', () => {
    const local = { brainUrl: 'http://127.0.0.1:7862', target: 'embedded' as const, os: 'linux' as const }
    const found = { url: 'http://localhost:7862/mcp' }
    expect(repairReason({ url: found.url }, found, local)).toBeNull()
  })

  it('does not apply the Windows rules on other platforms', () => {
    // The same entry is fine where the shell does not split arguments this way.
    const mac = { ...REMOTE, os: 'darwin' as const }
    const v = repairReason(
      { command: 'npx', args: ['-y', 'mcp-remote', ok.url, '--header', 'Authorization: Bearer btk_x'] },
      ok,
      mac,
    )
    expect(v).toBeNull()
  })
})
