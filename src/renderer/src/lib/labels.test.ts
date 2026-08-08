import { afterEach, describe, expect, it } from 'vitest'
import { formatBrainProgressLabel, invalidateUiLabelsCache, uiLabels } from './labels'
import { setUiLocaleCache } from './uiLocale'

describe('uiLabels', () => {
  afterEach(() => {
    setUiLocaleCache('pl')
    invalidateUiLabelsCache()
  })

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
    expect(labels.brainDoctorRun).toBe('Sprawdź stan')
    expect(labels.brainDoctorCopy).toBe('Kopiuj raport')
    expect(labels.brainDoctorOpenLogs).toBe('Otwórz logi')
    expect(labels.brainDoctorSummary(6, 1, 0)).toBe('6 OK · 1 WARN · 0 FAIL')
    expect(labels.statusDoctorFail).toBe('Doctor FAIL')
    expect(labels.brainStateChatsInTools).toBe('Czaty w narzędziach')
    expect(labels.brainStateDistilled).toBe('Zdestylowane')
    expect(labels.brainStateDistilledHint).toMatch(/skanu narzędzi/i)
    expect(labels.brainStateVaultNotes(1844)).toContain('1844')
    expect(labels.brainStateBacklog).toBe('Kolejka')
    expect(labels.cancel).toBe('Anuluj')
    expect(labels.brainStateLastDistill('2 dni temu')).toBe('Ostatnia destylacja 2 dni temu')
    expect(labels.brainStatePendingNew(7)).toBe('+7 nowych')
    expect(labels.runPipeline).toMatch(/Przemiel wszystko/i)
    expect(labels.runPipeline).not.toBe(labels.distill)
    expect(labels.redistillEverythingConfirm(235)).toMatch(/235/)
    expect(labels.redistillEverythingConfirm(235)).toMatch(/nadpisane/i)
    expect(labels.brainStateUncountable).toMatch(/256 MB/)
    expect(labels.distillEmptyBacklog).toBe('Brak nowych sesji do destylacji')
    expect(labels.brainPipeCollect).toBe('Zbieraj')
    expect(labels.brainPipeCollectNote).toBe('z asystentów')
    expect(labels.brainPipeDistill).toBe('Destyluj')
    expect(labels.brainPipeDistillNote).toBe('lokalny model')
    expect(labels.brainPipeIndex).toBe('Indeksuj')
    expect(labels.brainPipeIndexNote).toBe('embeddingi')
    expect(labels.brainPipeDeploy).toBe('Wyślij')
    expect(labels.brainPipeDeployNote).toBe('do Brain')
  })

  it('formats activity banner in Polish', () => {
    const labels = uiLabels()
    expect(
      labels.activityBanner({ kind: 'distill', done: 3, total: 7, detail: 'Sesja o vault backup' })
    ).toBe('Trwa: destylacja (3/7) · Sesja o vault backup')
    expect(labels.flowLiveBadge({ kind: 'distill', done: 3, total: 7 })).toBe('Na żywo: destylacja 3/7')
    expect(labels.flowFocusBanner({ kind: 'distill', done: 3, total: 7 })).toBe('Teraz: destylacja 3/7')
    expect(
      labels.flowFocusBanner({
        kind: 'distill',
        done: 10,
        total: 132,
        detail: 'https://example.com/very/long/path/that-should-be-hard-truncated-for-screenshots-and-chrome',
      }),
    ).toMatch(/^Teraz: destylacja 10\/132 · .{1,60}$/)
    expect(
      labels.flowFocusBanner({
        kind: 'distill',
        done: 1,
        total: 2,
        detail: 'https://example.com/very/long/path/that-should-be-hard-truncated-for-screenshots-and-chrome',
      }).length,
    ).toBeLessThanOrEqual('Teraz: destylacja 1/2 · '.length + 60)
    expect(labels.browseFilterAll).toBe('Wszystkie')
    expect(labels.browseLeadCount(12)).toContain('12')
    expect(labels.browseSearchPlaceholder).toContain('szukaj')
    expect(labels.dashboardRescan).toBe('Rescan')
    expect(labels.flowLiveBadge({ kind: 'mcp-query', phase: 'search_library', detail: 'vault' })).toBe(
      'Na żywo: wyszukiwanie w Brain',
    )
    expect(labels.flowFocusBanner({ kind: 'mcp-query', phase: 'search_library', detail: 'vault' })).toBe(
      'Teraz: wyszukiwanie w Brain',
    )
    expect(labels.flowLastMcpBadge('search_library')).toBe('Ostatnie: search_library · przed chwilą')
    expect(labels.activityBanner({ kind: 'doc-import', detail: 'report.epub' })).toBe(
      'Trwa: import dokumentu · report.epub'
    )
    expect(labels.flowWaitingCaption).toContain('aktywna ścieżka')
    expect(labels.guideFlowReplay).toBe('Odtwórz demo')
    expect(labels.guideFlowReplayLast).toBe('Odtwórz ostatnią aktywność')
  })

  it('exposes Connect first-time MCP labels in Polish', () => {
    const labels = uiLabels()
    expect(labels.connectCopyForClient('Cursor')).toBe('Kopiuj mcp.json dla Cursor')
    expect(labels.connectCopyForClient('Antigravity (Google IDE)')).toBe(
      'Kopiuj mcp.json dla Antigravity (Google IDE)'
    )
    expect(labels.connectPartialTitle).toContain('vault/library')
    expect(labels.connectChecklistTitle).toContain('4 kroki')
    expect(labels.connectMacNoAppHint).toContain('docs/CURSOR-MCP.md')
  })

  it('exposes guide and status strip labels in Polish', () => {
    const labels = uiLabels()
    expect(labels.navGuide).toBe('Jak to działa')
    expect(labels.guideTitle).toBe('Mapa Pomnia')
    expect(labels.guideLead).toContain('MCP')
    expect(labels.guideLead).toMatch(/deploy LAN|API destylacji/i)
    expect(labels.vaultGateUnlockTab).toBe('Odblokuj')
    expect(labels.vaultGateCreateSubmit).toContain('vault')
    expect(labels.brainSearchPlaceholder).toContain('zapytaj')
    expect(labels.toastModelReady).toBe('Model gotowy')
    expect(labels.flowIdleHoverCaption).toContain('Najedź')
    expect(labels.dashboardStatDocs).toBe('Dokumenty')
    expect(labels.dashboardStatDocsSub('9.1 MB', 3)).toBe('9.1 MB · 3 zindeksowane')
    expect(labels.dashboardStatDocsPending(1)).toBe('1 czeka na indeks')
    expect(labels.brainAttachExport).toContain('Dołącz eksport')
    expect(labels.importChatConfirmGenericWarn).toContain('Nie rozpoznano formatu')
    expect(labels.onboardingEngineLead).toMatch(/nomic-embed-text/)
    expect(labels.onboardingEngineLead).toMatch(/qwen2\.5:14b/)
    expect(labels.onboardingEnginePullBtn).toMatch(/Pobierz|Pomni/)
    expect(labels.onboardingEngineCancelPull).toBe('Anuluj')
    expect(labels.quarantinePromote).toContain('distilled')
    expect(labels.quarantineHeader(50)).toBe('Kwarantanna · 50')
    expect(labels.quarantineWeakToggle(235)).toContain('235')
    expect(labels.quarantineSearchPlaceholder).toMatch(/filtruj/i)
    expect(labels.quarantineNoMatches).toMatch(/filtra/)
    expect(labels.quarantineSelectToRead).toMatch(/kwarantanny/)
    expect(labels.quarantineDelete).toBe('Kasuj')
    expect(labels.quarantineDeleteConfirm('x.md')).toMatch(/x\.md/)
    expect(labels.quarantineDeletedToast('x.md')).toContain('x.md')
    expect(labels.quarantineDeleteAll).toBe('Kasuj wszystkie')
    expect(labels.quarantineDeleteAllConfirm(3)).toMatch(/3/)
    expect(labels.quarantineDeleteAllConfirm(3)).toMatch(/_review/)
    expect(labels.quarantineDeletedAllToast(3)).toMatch(/3/)
    expect(labels.guideStep1Title).toBe('Krok 1 — Zbieranie')
    expect(labels.guideDocsTitle).toBe('Dokumenty (PDF / EPUB)')
    expect(labels.statusStripTitle).toBe('Gdzie jesteś teraz')
    expect(labels.helpDontKnowStart).toBe('Nie wiem od czego zacząć →')
    expect(labels.dashboardTitle).toBe('Centrum dowodzenia')
    expect(labels.dashboardLead).toContain('zaszyfrowanym vaulcie')
    expect(labels.dashboardLead).not.toMatch(/wszystkich/i)
    expect(labels.strategyHybrid).toBe('czaty + config')
    expect(labels.strategySnapshot).toBe('tylko config')
    expect(labels.sourceMcpReads).toContain('czyta pamięć przez MCP')
    expect(labels.sourceMcpNotConnected).toContain('skonfiguruj w Connect')
    expect(labels.mcpClientsLead).toContain('czytają pamięć')
    expect(labels.lockVaultBtn).toBe('Zablokuj vault')
    expect(labels.dashboardBackupAndBrain).toBe('Backup i do Brain')
    expect(labels.dashboardBackupOnly).toBe('Tylko backup')
    expect(labels.dashboardSourcesSelected(5)).toBe('5 źródeł zaznaczonych')
  })

  it('returns the same object reference for PL', () => {
    expect(uiLabels(true)).toBe(uiLabels(false))
    expect(uiLabels()).toBe(uiLabels(true))
  })

  it('switches to English chrome when uiLocale is en', () => {
    setUiLocaleCache('en')
    invalidateUiLabelsCache()
    const labels = uiLabels()
    expect(labels.settingsTitle).toBe('Settings')
    expect(labels.uiLocale).toBe('Interface language')
    expect(labels.navSettings).toBe('Settings')
    expect(labels.dashboardTitle).toBe('Command center')
    expect(labels.dashboardBackupAndBrain).toBe('Backup & to Brain')
    expect(labels.runPipeline).toMatch(/Re-distill everything/i)
    expect(labels.runPipeline).not.toBe(labels.distill)
    expect(labels.brainStateDistilledHint).toMatch(/tools scan/i)
    expect(labels.brainStateUncountable).toMatch(/256 MB/)
    expect(labels.redistillEverythingConfirm(12)).toMatch(/overwritten/i)
    expect(labels.activityBanner({ kind: 'distill', done: 1, total: 2 })).toBe(
      'In progress: distillation (1/2)',
    )
  })

  it('exposes handshake proof-phrase labels in Polish', () => {
    const labels = uiLabels()
    expect(labels.handshake).toBe('Handshake')
    expect(labels.handshakePhrase).toBe('Fraza dowodu')
    expect(labels.handshakePhraseSave).toBe('Zapisz frazę')
    expect(labels.handshakePhraseSaved).toBe('Fraza Handshake zaktualizowana')
    expect(labels.handshakePhrasePreview('OK to Go Go Go')).toContain('OK to Go Go Go')
    expect(labels.handshakeEnabled).toBe('Handshake')
    expect(labels.handshakeEnabledHint).toContain('pierwszą odpowiedź')
    expect(labels.handshakePhraseHint).toContain('dowód')
    expect(labels.handshakeRefreshHint).toContain('Connect')
    expect(labels.autoCheckpoint).toBe('Kontynuacja sesji')
    expect(labels.autoCheckpointEnabled).toBe('Auto-checkpoint')
    expect(labels.autoCheckpointEnabledHint).toContain('checkpoint_session')
    expect(labels.agentBrainModeBriefWrite).toContain('Zapisz')
    expect(labels.profilePreviewCopy).toBe('Kopiuj')
    expect(labels.profilePreviewCopied).toBe('Skopiowano USER.md')
    expect(labels.updateLinuxHint).toMatch(/AppImage|\.deb/)
    expect(labels.dataLocationsTitle).toBe('Gdzie leżą dane')
    expect(labels.linuxUnsignedTitle).toMatch(/Linux/)
    expect(labels.openAtLogin).not.toMatch(/Windows/i)
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
