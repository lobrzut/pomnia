import { describe, expect, it } from 'vitest'
import { uiLabels } from './labels'

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
  })

  it('returns the same object reference for any argument', () => {
    expect(uiLabels(true)).toBe(uiLabels(false))
    expect(uiLabels()).toBe(uiLabels(true))
  })
})
