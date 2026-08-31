import { describe, expect, it } from 'vitest'

import { shouldWarnVaultNotSynced } from './vaultSyncWarning.js'

describe('warn when this machine writes to a vault the agents never read', () => {
  it('warns on the exact configuration that drifted', () => {
    // Brain re-pointed at the server, vault left behind, push never enabled.
    // Six weeks later the local vault was 78 sessions behind 589.
    expect(
      shouldWarnVaultNotSynced({
        brainTarget: 'remote',
        brainMcpUrl: 'http://192.168.1.248:7865',
        replicaAutoSync: false,
      }),
    ).toBe(true)
  })

  it('treats a missing flag the same as off — nothing is being sent either way', () => {
    expect(
      shouldWarnVaultNotSynced({ brainTarget: 'remote', brainMcpUrl: 'http://server:7865' }),
    ).toBe(true)
  })

  it('stays quiet once the push is on', () => {
    expect(
      shouldWarnVaultNotSynced({
        brainTarget: 'remote',
        brainMcpUrl: 'http://server:7865',
        replicaAutoSync: true,
      }),
    ).toBe(false)
  })

  it('stays quiet on embedded — there is only one vault to drift from', () => {
    expect(shouldWarnVaultNotSynced({ brainTarget: 'embedded', replicaAutoSync: false })).toBe(false)
    expect(shouldWarnVaultNotSynced({ replicaAutoSync: false })).toBe(false)
  })

  it('stays quiet with no server configured — that is setup, not drift', () => {
    // Warning here would spend attention on a situation that is not going wrong.
    expect(shouldWarnVaultNotSynced({ brainTarget: 'remote', replicaAutoSync: false })).toBe(false)
    expect(
      shouldWarnVaultNotSynced({ brainTarget: 'remote', brainMcpUrl: '   ', replicaAutoSync: false }),
    ).toBe(false)
  })
})
