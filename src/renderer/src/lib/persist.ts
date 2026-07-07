/** Small localStorage helpers — every user-edited field should go through these. */

const MIGRATION_FLAG = 'pomnia.migratedFromReliqua'
const LEGACY_PREFIX = 'reliqua.'

/** One-time copy of reliqua.* keys → pomnia.* so upgrades keep settings. */
export function migrateLegacyStorage(): void {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(LEGACY_PREFIX)) keys.push(k)
    }
    for (const key of keys) {
      const suffix = key.slice(LEGACY_PREFIX.length)
      const next = `pomnia.${suffix}`
      if (localStorage.getItem(next) === null) {
        const val = localStorage.getItem(key)
        if (val !== null) localStorage.setItem(next, val)
      }
    }
    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {
    /* quota / private mode */
  }
}

export function loadStr(key: string, fallback = ''): string {
  migrateLegacyStorage()
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function saveStr(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* quota / private mode */
  }
}

export function loadBool(key: string, fallback: boolean): boolean {
  migrateLegacyStorage()
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}
