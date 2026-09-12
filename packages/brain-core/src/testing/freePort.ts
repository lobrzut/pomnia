// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * A port the OS has just confirmed is free.
 *
 * Tests used to derive one from the pid — `42000 + (pid % 1000) + random(200)`
 * and six variations. The arithmetic guarantees two concurrent runs pick
 * different numbers, which is the problem it was written for, but it cannot
 * know which numbers the host refuses to hand out at all.
 *
 * Windows reserves whole ranges for Hyper-V and WSL, and they move between
 * machines. On this one `netsh interface ipv4 show excludedportrange` lists
 * 42657-42756 — inside the range setVaultRoot.test.ts picks from. Roughly one
 * run in three died on `listen EACCES 127.0.0.1:42693`, which reads like a
 * broken test and is not one. A suite that is red at random teaches people to
 * ignore red, so this is worth a helper.
 *
 * Binding to port 0 asks the kernel for a free port instead of guessing at one.
 * There is a window between closing this probe and the caller binding, so this
 * is not airtight — but the kernel hands out ports round-robin rather than
 * lowest-free, so a collision needs an unrelated process to claim exactly this
 * number in that window. That is far narrower than an 8% chance of picking a
 * range the OS will never allow.
 */

import { createServer } from 'node:net'

export function freePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const addr = probe.address()
      if (!addr || typeof addr !== 'object') {
        probe.close(() => reject(new Error('the probe listened without an address')))
        return
      }
      const { port } = addr
      probe.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}
