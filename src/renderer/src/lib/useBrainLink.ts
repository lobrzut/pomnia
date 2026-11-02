// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useEffect, useState } from 'react'

import { api } from './api'
import { isMini } from './flavour'
import { useStore } from '../store/useStore'

export type BrainLink = {
  phase: 'checking' | 'up' | 'down'
  where: 'local' | 'remote'
  /** Loopback is admin. A remote agent token is standard. Down has no role. */
  role: 'admin' | 'standard' | null
}

/**
 * Whether this app can talk to a Brain, and as whom.
 *
 * Mini is always remote. Desktop is remote only when that target is selected;
 * the embedded server is loopback, which the server treats as admin.
 */
export function useBrainLink(): BrainLink {
  const brainTarget = useStore((s) => s.brainTarget)
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const [link, setLink] = useState<BrainLink>({ phase: 'checking', where: isMini ? 'remote' : 'local', role: null })

  useEffect(() => {
    let cancel = false
    const remote = isMini || brainTarget === 'remote'

    async function tick(): Promise<void> {
      if (!remote) {
        try {
          const core = await api.brainCoreStatus()
          if (cancel) return
          setLink({
            phase: core.running ? 'up' : 'down',
            where: 'local',
            role: core.running ? 'admin' : null,
          })
        } catch {
          if (!cancel) setLink({ phase: 'down', where: 'local', role: null })
        }
        return
      }
      try {
        const st = await api.connectTokenStatus()
        if (cancel) return
        if (st.state === 'admin') setLink({ phase: 'up', where: 'remote', role: 'admin' })
        else if (st.state === 'not-admin') setLink({ phase: 'up', where: 'remote', role: 'standard' })
        else setLink({ phase: 'down', where: 'remote', role: null })
      } catch {
        if (!cancel) setLink({ phase: 'down', where: 'remote', role: null })
      }
    }

    void tick()
    const id = setInterval(() => void tick(), 15_000)
    return () => {
      cancel = true
      clearInterval(id)
    }
  }, [brainTarget, remoteBrainUrl])

  return link
}
