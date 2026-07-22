/**
 * Handshake settings helpers — proof phrase for agent greeting (not a Desktop unlock ritual).
 */

import {
  DEFAULT_HANDSHAKE_PHRASE,
  displayHandshakePhrase,
} from '@core/handshakePhrase.js'
import { getAppSettings } from './appSettings.js'

export {
  DEFAULT_HANDSHAKE_PHRASE,
  displayHandshakePhrase,
} from '@core/handshakePhrase.js'

/** When true, Connect rules + MCP tell agents to open the first reply with the phrase. */
export function isHandshakeEnabled(): boolean {
  return getAppSettings().handshakeEnabled !== false
}

export function getHandshakePhrase(): string {
  return displayHandshakePhrase(
    getAppSettings().handshakePhrase?.trim() || DEFAULT_HANDSHAKE_PHRASE,
  )
}
