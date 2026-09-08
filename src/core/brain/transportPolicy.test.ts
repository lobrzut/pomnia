// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'

import { isInsecureRemoteHttpUrl } from './transportPolicy'

describe('desktop transportPolicy (F12)', () => {
  it('flags remote plain HTTP Brain URLs', () => {
    expect(isInsecureRemoteHttpUrl('http://192.168.1.248:7865')).toBe(true)
    expect(isInsecureRemoteHttpUrl('http://127.0.0.1:7862')).toBe(false)
  })
})
