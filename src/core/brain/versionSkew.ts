// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Say when Desktop and the Brain it is talking to are not the same release.
 *
 * `/healthz` already publishes `version`. The desktop used to ignore it, so a
 * homelab still on last month's tarball and a Desktop that just updated failed
 * in whatever way the next tool happened to — a refused sync, an empty search,
 * a snippet that did not match — and the badge stayed green.
 *
 * There is no separate protocol or schema version to negotiate. Desktop
 * (`pomnia`) and brain-core (`@pomnia/brain-core`) ship the same `x.y.z`.
 * Inequality is the whole contract. A mismatch warns. It does not drop the
 * connection: refusing every patch would lock out a brain that is one release
 * behind and still answers.
 *
 * Quiet when both sides parse as the same numeric `x.y.z`. A leading `v` and
 * a pre-release or build suffix are ignored, so `v0.1.91` and `0.1.91-beta.1`
 * are the same release for this check.
 *
 * `0.0.0` is not a release. brain-core returns it when it cannot read its own
 * package.json. Treating that as "ancient brain" would send people hunting a
 * version that was never shipped.
 */
import { isPomniaService } from '../../../packages/brain-core/src/serviceName.js'

export type VersionSkewReason =
  | 'match'
  | 'skew'
  | 'brain-version-missing'
  | 'brain-version-unreadable'
  | 'client-version-missing'
  | 'both-missing'

export interface VersionSkewAssessment {
  /** `quiet` is a match. Everything else is a warning, never a refused connection. */
  level: 'quiet' | 'warn'
  reason: VersionSkewReason
  /** Normalized `x.y.z` when that side parsed as a real release. */
  client: string | null
  brain: string | null
  /**
   * What the Brain actually sent when it was not a comparable release
   * (`0.0.0`, or a string that is not `x.y.z`). Null when the field was absent.
   */
  brainReported: string | null
  /** Which side is older. Set only for `skew`. */
  older: 'desktop' | 'brain' | null
}

interface Release {
  kind: 'release'
  version: string
  major: number
  minor: number
  patch: number
}

type Classified =
  | Release
  | { kind: 'missing' }
  | { kind: 'sentinel'; reported: string }
  | { kind: 'unreadable'; reported: string }

const RELEASE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i

/** Numeric `x.y.z`, or null when the string is not that shape. */
export function parseReleaseVersion(
  raw: string,
): { version: string; major: number; minor: number; patch: number } | null {
  const m = RELEASE.exec(raw.trim())
  if (!m) return null
  const major = Number(m[1])
  const minor = Number(m[2])
  const patch = Number(m[3])
  return { version: `${major}.${minor}.${patch}`, major, minor, patch }
}

function classify(raw: unknown): Classified {
  if (typeof raw !== 'string') return { kind: 'missing' }
  const trimmed = raw.trim()
  if (!trimmed) return { kind: 'missing' }
  const parsed = parseReleaseVersion(trimmed)
  if (!parsed) return { kind: 'unreadable', reported: trimmed.slice(0, 80) }
  if (parsed.major === 0 && parsed.minor === 0 && parsed.patch === 0) {
    return { kind: 'sentinel', reported: parsed.version }
  }
  return { kind: 'release', ...parsed }
}

function cmp(a: Release, b: Release): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

/**
 * Compare the Desktop build with the `version` field from `/healthz`.
 *
 * Does not throw. A missing, empty, non-string, or `0.0.0` Brain version is
 * a warning with a reason, not an exception.
 */
export function assessVersionSkew(clientVersion: unknown, brainVersion: unknown): VersionSkewAssessment {
  const client = classify(clientVersion)
  const brain = classify(brainVersion)
  const clientRelease = client.kind === 'release' ? client.version : null
  const brainRelease = brain.kind === 'release' ? brain.version : null
  const brainReported = brain.kind === 'sentinel' || brain.kind === 'unreadable' ? brain.reported : null

  if (client.kind === 'release' && brain.kind === 'release') {
    const diff = cmp(client, brain)
    if (diff === 0) {
      return {
        level: 'quiet',
        reason: 'match',
        client: client.version,
        brain: brain.version,
        brainReported: null,
        older: null,
      }
    }
    return {
      level: 'warn',
      reason: 'skew',
      client: client.version,
      brain: brain.version,
      brainReported: null,
      older: diff > 0 ? 'brain' : 'desktop',
    }
  }

  if (client.kind !== 'release' && brain.kind !== 'release') {
    return {
      level: 'warn',
      reason: 'both-missing',
      client: null,
      brain: null,
      brainReported,
      older: null,
    }
  }

  if (brain.kind === 'unreadable') {
    return {
      level: 'warn',
      reason: 'brain-version-unreadable',
      client: clientRelease,
      brain: null,
      brainReported,
      older: null,
    }
  }

  if (brain.kind !== 'release') {
    return {
      level: 'warn',
      reason: 'brain-version-missing',
      client: clientRelease,
      brain: null,
      brainReported,
      older: null,
    }
  }

  return {
    level: 'warn',
    reason: 'client-version-missing',
    client: null,
    brain: brainRelease,
    brainReported: null,
    older: null,
  }
}

/**
 * Version check for a `/healthz` body.
 *
 * Returns null when this payload is not brain-core. A legacy proxy or a stats
 * document is a different problem (the engine check already names it); piling
 * "no version" on top of "wrong brain" hides the real one.
 *
 * A brain-core body with no `version` field is a warning, not null and not a throw.
 */
export function assessHealthPayload(
  clientVersion: unknown,
  health: unknown,
): VersionSkewAssessment | null {
  if (!health || typeof health !== 'object') return null
  const data = health as Record<string, unknown>
  if (!isPomniaService(data.service)) return null
  return assessVersionSkew(clientVersion, data.version)
}

function desktopLabel(client: string | null, locale: 'pl' | 'en'): string {
  if (client) return client
  return locale === 'pl' ? 'nieznany' : 'unknown'
}

/** Plain-language warning. Null when the versions match — the UI stays quiet. */
export function formatVersionSkew(a: VersionSkewAssessment, locale: 'pl' | 'en'): string | null {
  if (a.level === 'quiet') return null
  return locale === 'pl' ? formatPl(a) : formatEn(a)
}

function formatEn(a: VersionSkewAssessment): string {
  const desktop = desktopLabel(a.client, 'en')
  switch (a.reason) {
    case 'skew':
      if (a.older === 'brain') {
        return (
          `Desktop ${a.client} and Brain ${a.brain} are different releases. ` +
          `This Brain is older, so search, sync, and MCP tools can fail in ways that look like a bad connection. ` +
          `Update the Brain to ${a.client}. The connection stays open.`
        )
      }
      return (
        `Desktop ${a.client} and Brain ${a.brain} are different releases. ` +
        `This Desktop is older. Update Desktop (GitHub Releases) so it matches Brain ${a.brain}. ` +
        `The connection stays open.`
      )
    case 'brain-version-missing':
      if (a.brainReported === '0.0.0') {
        return (
          `This Brain reported 0.0.0, which means it could not read its own version. Desktop is ${desktop}. ` +
          `That is not a release match. Update or rebuild the Brain. The connection stays open.`
        )
      }
      return (
        `This Brain did not report a version, so Desktop ${desktop} cannot tell whether they match. ` +
        `Current builds put version on /healthz. If search or sync misbehaves, update the Brain. ` +
        `The connection stays open.`
      )
    case 'brain-version-unreadable':
      return (
        `This Brain reported “${a.brainReported}”, which is not a release number Desktop ${desktop} can compare. ` +
        `Update the Brain to the same release as Desktop if tools misbehave. The connection stays open.`
      )
    case 'client-version-missing':
      return (
        `Desktop did not report its version. Brain is ${a.brain}, so a match cannot be confirmed. ` +
        `Reinstall Desktop if this persists. The connection stays open.`
      )
    case 'both-missing':
      if (a.brainReported === '0.0.0') {
        return (
          `Neither side has a real release number. This Brain reported 0.0.0, which means it could not read its own version. ` +
          `Update Desktop and the Brain to the same release if tools misbehave. The connection stays open.`
        )
      }
      return (
        `Neither Desktop nor this Brain reported a version, so a mismatch cannot be ruled out. ` +
        `Update both to the same release if tools misbehave. The connection stays open.`
      )
    default:
      return (
        `Desktop ${desktop} and this Brain could not be compared. ` +
        `Update both to the same release if tools misbehave. The connection stays open.`
      )
  }
}

function formatPl(a: VersionSkewAssessment): string {
  const desktop = desktopLabel(a.client, 'pl')
  switch (a.reason) {
    case 'skew':
      if (a.older === 'brain') {
        return (
          `Desktop ${a.client} i Brain ${a.brain} to różne wydania. ` +
          `Ten Brain jest starszy — wyszukiwanie, synchronizacja i narzędzia MCP mogą się wyłożyć tak, że wygląda to jak błąd połączenia. ` +
          `Zaktualizuj Brain do ${a.client}. Połączenie zostaje.`
        )
      }
      return (
        `Desktop ${a.client} i Brain ${a.brain} to różne wydania. ` +
        `Ta aplikacja jest starsza. Zaktualizuj Desktop (GitHub Releases), żeby zrównał się z Brain ${a.brain}. ` +
        `Połączenie zostaje.`
      )
    case 'brain-version-missing':
      if (a.brainReported === '0.0.0') {
        return (
          `Ten Brain podał 0.0.0 — tak mówi, kiedy nie umie odczytać własnej wersji. Desktop jest ${desktop}. ` +
          `To nie jest zgodność wydania. Zaktualizuj albo przebuduj Brain. Połączenie zostaje.`
        )
      }
      return (
        `Ten Brain nie podał wersji, więc Desktop ${desktop} nie wie, czy do siebie pasują. ` +
        `Aktualne wydania wpisują pole version w /healthz. Jeśli wyszukiwanie albo synchronizacja działa dziwnie, zaktualizuj Brain. ` +
        `Połączenie zostaje.`
      )
    case 'brain-version-unreadable':
      return (
        `Ten Brain podał „${a.brainReported}”, a tego Desktop ${desktop} nie umie porównać z numerem wydania. ` +
        `Jeśli narzędzia działają dziwnie, zaktualizuj Brain do tego samego wydania co Desktop. Połączenie zostaje.`
      )
    case 'client-version-missing':
      return (
        `Desktop nie podał swojej wersji. Brain jest ${a.brain}, więc zgodności nie da się potwierdzić. ` +
        `Jeśli to zostaje, przeinstaluj Desktop. Połączenie zostaje.`
      )
    case 'both-missing':
      if (a.brainReported === '0.0.0') {
        return (
          `Żadna strona nie ma prawdziwego numeru wydania. Ten Brain podał 0.0.0 — tak mówi, kiedy nie umie odczytać własnej wersji. ` +
          `Jeśli narzędzia działają dziwnie, zaktualizuj Desktop i Brain do tego samego wydania. Połączenie zostaje.`
        )
      }
      return (
        `Ani Desktop, ani ten Brain nie podały wersji, więc rozjazdu nie da się wykluczyć. ` +
        `Jeśli narzędzia działają dziwnie, zaktualizuj oba do tego samego wydania. Połączenie zostaje.`
      )
    default:
      return (
        `Desktop ${desktop} i tego Brain nie da się porównać. ` +
        `Jeśli narzędzia działają dziwnie, zaktualizuj oba do tego samego wydania. Połączenie zostaje.`
      )
  }
}

export interface VersionSkewDoctorCheck {
  id: 'brain-version'
  level: 'WARN'
  message: string
  action: string
  data: Record<string, unknown>
}

/** Doctor line. Null when versions match, so a healthy pair adds no noise. */
export function versionSkewToDoctorCheck(a: VersionSkewAssessment): VersionSkewDoctorCheck | null {
  const message = formatVersionSkew(a, 'en')
  if (!message) return null
  return {
    id: 'brain-version',
    level: 'WARN',
    message,
    action: doctorAction(a),
    data: {
      client: a.client,
      brain: a.brain,
      reason: a.reason,
      brainReported: a.brainReported,
      older: a.older,
    },
  }
}

function doctorAction(a: VersionSkewAssessment): string {
  switch (a.reason) {
    case 'skew':
      return a.older === 'brain'
        ? `Update the Brain to ${a.client} (same release as this Desktop).`
        : `Update Desktop to ${a.brain} (GitHub Releases).`
    case 'brain-version-missing':
    case 'brain-version-unreadable':
      return 'Update or rebuild the Brain so /healthz version is the real release (not missing, not 0.0.0).'
    case 'client-version-missing':
      return 'Reinstall Desktop so it reports its version, then compare again.'
    default:
      return 'Update Desktop and the Brain to the same release.'
  }
}
