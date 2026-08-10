import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp/pomnia-test' } }))

let locale: 'pl' | 'en' = 'pl'
vi.mock('../appSettings.js', () => ({ getAppSettings: () => ({ uiLocale: locale }) }))

const load = async (): Promise<typeof import('../mainStrings.js')> => {
  vi.resetModules()
  return import('../mainStrings.js')
}

beforeEach(() => {
  locale = 'pl'
})

/**
 * The renderer had a label table for a year while the main process wrote its
 * strings inline, so switching to English changed the window and left the tray
 * in Polish. TypeScript could not catch it: a string literal in a menu entry is
 * a perfectly good string. These tests are the check that types cannot make —
 * they assert the tray actually changes language, not that it compiles.
 */
describe('main-process strings follow the UI locale', () => {
  it('gives every tray entry in English when the locale is en', async () => {
    locale = 'en'
    const { m } = await load()
    const s = m()
    for (const text of [
      s.trayOpen,
      s.trayQuit,
      s.trayProfile,
      s.trayBrainStarting,
      s.trayBrainStopped,
      s.trayBrainStoppedWith('boom'),
      s.trayBrainRunning('127.0.0.1:7862'),
      s.trayStopBrain,
      s.trayFloatingMonitor,
    ]) {
      expect(text, `"${text}" still reads as Polish`).not.toMatch(
        /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]|wyszukiwarka|zatrzyman|uruchamian|Profil\b|Zakończ|Otwórz/,
      )
    }
  })

  it('keeps the tray in Polish when the locale is pl', async () => {
    const { m } = await load()
    expect(m().trayProfile).toBe('Profil')
    expect(m().trayBrainStopped).toContain('zatrzymana')
  })

  /**
   * Read per call, not captured at import: Settings can change the language
   * while the app runs, and a cached copy keeps answering in the language the
   * user just left. This is the assertion that a `const s = m()` at module top
   * would quietly break.
   */
  it('follows a locale change without a reload', async () => {
    const { m } = await load()
    expect(m().trayQuit).toBe('Zakończ')
    locale = 'en'
    expect(m().trayQuit).toBe('Quit')
  })

  it('exposes the locale to modules that keep their own tables', async () => {
    const { isEnLocale } = await load()
    expect(isEnLocale()).toBe(false)
    locale = 'en'
    expect(isEnLocale()).toBe(true)
  })

  /** Both objects implement the same interface, so a missing key cannot compile
   *  — but a key present in both with the *same* Polish text can. */
  it('has no entry left identical between the two locales by accident', async () => {
    locale = 'pl'
    const pl = (await load()).m()
    locale = 'en'
    const en = (await load()).m()
    const shared = ['trayOpen', 'trayQuit', 'trayProfile', 'trayBrainStopped'] as const
    for (const key of shared) {
      expect(en[key], `${key} is the same in both locales`).not.toBe(pl[key])
    }
  })
})
