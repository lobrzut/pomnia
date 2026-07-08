import { describe, expect, it } from 'vitest'
import { formatBrainProgressLabel, uiLabels } from './labels'

describe('uiLabels', () => {
  it('returns Polish labels regardless of simple mode flag', () => {
    const simple = uiLabels(true)
    const advanced = uiLabels(false)

    expect(simple.simpleMode).toBe('Tryb prosty')
    expect(advanced.simpleMode).toBe('Tryb prosty')
    expect(simple.settingsTitle).toBe('Ustawienia')
    expect(advanced.settingsTitle).toBe('Ustawienia')
    expect(simple.distill).toBe('Przygotuj pamięć')
    expect(advanced.distill).toBe('Przygotuj pamięć')
    expect(simple.importDropFailed).toBe('Upuszczenie nie powiodło się')
    expect(simple.importDropNoPath).toContain('Wybierz plik')
    expect(simple.importDocIndexedToast(12)).toBe('Zindeksowano 12 chunków')
    expect(simple.importDocQueuedToast).toBe('Zapisano — indeks po uruchomieniu Brain')
    expect(simple.importDocNotIndexedBadge).toBe('bez indeksu')
    expect(simple.importDocProgressBrainStart).toBe('Uruchamianie wyszukiwarki')
  })

  it('exposes Polish brain state card labels', () => {
    const labels = uiLabels()
    expect(labels.brainStateTitle).toBe('Stan Brain')
    expect(labels.brainStateChatsInTools).toBe('Czaty w narzędziach')
    expect(labels.brainStateDistilled).toBe('Zdestylowane')
    expect(labels.brainStateBacklog).toBe('Kolejka')
    expect(labels.cancel).toBe('Anuluj')
    expect(labels.brainStateLastDistill('2 dni temu')).toBe('Ostatnia destylacja 2 dni temu')
    expect(labels.brainStatePendingNew(7)).toBe('+7 nowych')
    expect(labels.distillEmptyBacklog).toBe('Brak nowych sesji do destylacji')
  })

  it('formats activity banner in Polish', () => {
    const labels = uiLabels()
    expect(
      labels.activityBanner({ kind: 'distill', done: 3, total: 7, detail: 'Sesja o vault backup' })
    ).toBe('Trwa: destylacja (3/7) · Sesja o vault backup')
    expect(labels.activityBanner({ kind: 'doc-import', detail: 'report.epub' })).toBe(
      'Trwa: import dokumentu · report.epub'
    )
  })

  it('returns the same object reference for any argument', () => {
    expect(uiLabels(true)).toBe(uiLabels(false))
    expect(uiLabels()).toBe(uiLabels(true))
  })
})

describe('formatBrainProgressLabel', () => {
  it('maps distill phase to Polish with detail', () => {
    expect(formatBrainProgressLabel('distill', 'Session title')).toBe('destylacja · Session title')
  })

  it('maps encrypt phase to Polish', () => {
    expect(formatBrainProgressLabel('encrypt')).toBe('szyfrowanie')
  })
})
