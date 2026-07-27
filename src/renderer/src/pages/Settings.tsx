// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useCallback, useEffect, useState } from 'react'
import { Activity, Brain, Clock, FileArchive, FolderOpen, Handshake, Languages, Lock, Minimize2, Palette, Plug, RefreshCw, RotateCcw, Shield, ShieldCheck, Vault } from 'lucide-react'
import {
  isValidHandshakePhraseSetting,
} from '@core/handshakePhrase'
import { Button, Field, GlassCard, Input, Spinner, Toggle } from '../components/ui'
import { ClientIcon } from '../components/ClientIcon'
import { api, isMock } from '../lib/api'
import { humanBytes, relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { COLOR_SCHEMES, type ColorScheme } from '../lib/theme'
import { UI_LOCALES, type UiLocale } from '../lib/uiLocale'
import { useStore } from '../store/useStore'
import type { ClientId, ClientStatus } from '../lib/types'

const ALL_CLIENTS: ClientId[] = ['claude-code', 'cursor', 'antigravity', 'claude-desktop', 'vscode', 'windsurf', 'hermes']

const EMBEDDED_URL = 'http://127.0.0.1:7862'

function hasModel(models: string[], want: string): boolean {
  return models.some((m) => m === want || m === `${want}:latest` || m.replace(/:latest$/, '') === want)
}

type HealthRow = { id: string; label: string; ok: boolean | null; detail: string }

function HealthCheck() {
  const labels = uiLabels()
  const vault = useStore((s) => s.vault)
  const ollamaUrl = useStore((s) => s.ollamaUrl)
  const brainTarget = useStore((s) => s.brainTarget)
  const remoteBrainUrl = useStore((s) => s.remoteBrainUrl)
  const brainDeployTarget = useStore((s) => s.brainDeployTarget)
  const connectToken = useStore((s) => s.connectToken)
  const simpleMode = useStore((s) => s.simpleMode)
  const [rows, setRows] = useState<HealthRow[]>([])
  const [checking, setChecking] = useState(false)

  const effectiveTarget = simpleMode ? 'embedded' : brainTarget
  const brainUrl = effectiveTarget === 'embedded' ? EMBEDDED_URL : remoteBrainUrl

  const refresh = useCallback(async () => {
    setChecking(true)
    const next: HealthRow[] = []
    try {
      next.push({
        id: 'vault',
        label: labels.healthVault,
        ok: vault.open,
        detail: vault.open ? vault.path ?? vault.name ?? labels.healthOk : 'Otwórz lub utwórz vault'
      })

      let status = null
      try {
        status = await api.brainStatus(ollamaUrl || undefined)
      } catch {
        status = null
      }
      next.push({
        id: 'ollama',
        label: labels.healthOllama,
        ok: !!status?.reachable,
        detail: status?.reachable ? status.baseUrl : 'Ollama niedostępne — zainstaluj i uruchom ollama.com'
      })

      const models = status?.models ?? []
      const embedOk = hasModel(models, status?.embedModel ?? 'nomic-embed-text')
      next.push({
        id: 'embed',
        label: labels.healthEmbedModel,
        ok: status?.reachable ? embedOk : null,
        detail: embedOk
          ? status?.embedModel ?? 'nomic-embed-text'
          : status?.reachable
            ? `Brak modelu — ollama pull ${status?.embedModel ?? 'nomic-embed-text'}`
            : labels.healthSkip
      })

      const chatOk = hasModel(models, status?.chatModel ?? 'qwen2.5:14b')
      next.push({
        id: 'chat',
        label: labels.healthChatModel,
        ok: status?.reachable ? chatOk : null,
        detail: chatOk
          ? status?.chatModel ?? 'qwen2.5:14b'
          : status?.reachable
            ? `Brak modelu — ollama pull ${status?.chatModel ?? 'qwen2.5:14b'}`
            : labels.healthSkip
      })

      if (effectiveTarget === 'embedded') {
        const core = await api.brainCoreStatus()
        next.push({
          id: 'core',
          label: labels.healthBrainCore,
          ok: core.running,
          detail: core.running
            ? core.url ?? labels.healthOk
            : core.lastError || 'Uruchom w zakładce Brain'
        })
      } else {
        next.push({
          id: 'core',
          label: labels.healthBrainCore,
          ok: null,
          detail: labels.healthSkip
        })
      }

      try {
        const conn = await api.connectStatus(
          brainUrl,
          effectiveTarget === 'remote' ? connectToken || undefined : undefined,
          effectiveTarget
        )
        next.push({
          id: 'mcp',
          label: labels.healthMcp,
          ok: conn.brain.reachable,
          detail: conn.brain.reachable
            ? conn.brain.url
            : conn.brain.error || 'Brain MCP nieosiągalny'
        })
      } catch (e) {
        next.push({
          id: 'mcp',
          label: labels.healthMcp,
          ok: false,
          detail: (e as Error).message
        })
      }

      if (effectiveTarget === 'remote') {
        next.push({
          id: 'deploy',
          label: labels.healthDeployPath,
          ok: null,
          detail: brainDeployTarget?.trim() || 'Nie skonfigurowano (opcjonalnie)'
        })
      }
    } finally {
      setRows(next)
      setChecking(false)
    }
  }, [
    vault.open,
    vault.path,
    vault.name,
    ollamaUrl,
    effectiveTarget,
    brainUrl,
    connectToken,
    brainDeployTarget,
    labels
  ])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <GlassCard className="mb-4 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Activity className="h-4 w-4 text-mint" /> {labels.healthTitle}
        </div>
        <div className="flex gap-2">
          <Button variant="soft" onClick={() => void api.openLogs()}>
            <FolderOpen className="h-3.5 w-3.5" /> {labels.healthOpenLogs}
          </Button>
          <Button variant="soft" onClick={() => void refresh()} disabled={checking}>
            {checking ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {labels.healthRefresh}
          </Button>
        </div>
      </div>
      <p className="mb-4 text-xs text-ink-dim">{labels.healthLead}</p>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="flex items-center gap-2 text-xs text-ink-dim">
            <Spinner className="h-3.5 w-3.5" /> {labels.healthChecking}
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3.5 py-2.5"
            >
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full"
                style={{
                  background:
                    r.ok === true ? '#34d399' : r.ok === false ? '#fb7185' : '#5b6178',
                  boxShadow: r.ok === true ? '0 0 8px #34d39980' : undefined
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{r.label}</div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-ink-dim">{r.detail}</div>
              </div>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                {r.ok === true ? labels.healthOk : r.ok === false ? labels.healthFail : '—'}
              </span>
            </li>
          ))
        )}
      </ul>
    </GlassCard>
  )
}

export default function Settings() {
  const {
    vault,
    lockVault,
    snapshots,
    toast,
    connectClientOverride,
    setConnectClientVisible,
    resetConnectClient,
    settingsExportDir,
    brainDeployTarget,
    setSettingsExportDir,
    simpleMode,
    setSimpleMode,
    minimizeToTray,
    closeToTray,
    setMinimizeToTray,
    setCloseToTray,
    floatingMonitorOnMinimize,
    setFloatingMonitorOnMinimize,
    openAtLogin,
    setOpenAtLogin,
    colorScheme,
    setColorScheme,
    uiLocale,
    setUiLocale,
    handshakePhrase,
    setHandshakePhrase,
    handshakeEnabled,
    setHandshakeEnabled,
    autoCheckpointEnabled,
    setAutoCheckpointEnabled,
    brainTarget,
    remoteBrainUrl,
    connectToken
  } = useStore()
  const labels = uiLabels()
  const schemeLabels: Record<ColorScheme, string> = {
    mint: labels.colorSchemeMint,
    iris: labels.colorSchemeIris,
    glass: labels.colorSchemeGlass,
  }
  const localeLabels: Record<UiLocale, string> = {
    pl: labels.uiLocalePl,
    en: labels.uiLocaleEn,
  }
  const [exportSnap, setExportSnap] = useState(snapshots[0]?.id ?? '')
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [verifying, setVerifying] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [phraseDraft, setPhraseDraft] = useState(handshakePhrase)
  const [phraseError, setPhraseError] = useState<string | null>(null)
  const [phraseSaving, setPhraseSaving] = useState(false)

  useEffect(() => {
    setPhraseDraft(handshakePhrase)
  }, [handshakePhrase])

  useEffect(() => {
    void api
      .appVersion()
      .then((r) => setAppVersion(r.version))
      .catch(() => {})
  }, [])

  async function saveHandshakePhrase() {
    const trimmed = phraseDraft.trim()
    if (!trimmed) {
      setPhraseError(labels.handshakePhraseEmpty)
      return
    }
    if (!isValidHandshakePhraseSetting(trimmed)) {
      setPhraseError(labels.handshakePhraseTooShort)
      return
    }
    setPhraseSaving(true)
    setPhraseError(null)
    try {
      const r = await setHandshakePhrase(trimmed)
      if (!r.ok) {
        setPhraseError(labels.handshakePhraseTooShort)
        return
      }
      setPhraseDraft(r.phrase)
      toast({ kind: 'success', title: labels.handshakePhraseSaved })
    } finally {
      setPhraseSaving(false)
    }
  }

  async function verifyIntegrity() {
    setVerifying(true)
    try {
      const r = await api.verify()
      toast({
        kind: r.ok ? 'success' : 'error',
        title: r.ok ? 'Integralność vaultu OK' : `${r.errors.length} błąd(ów) integralności`,
        detail: `Sprawdzono ${r.checked} zaszyfrowanych blobów`,
      })
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    const url = (simpleMode ? 'embedded' : brainTarget) === 'embedded' ? EMBEDDED_URL : remoteBrainUrl
    api
      .connectStatus(
        url,
        !simpleMode && brainTarget === 'remote' ? connectToken || undefined : undefined,
        simpleMode ? 'embedded' : brainTarget
      )
      .then((r) => setClients(r.clients))
      .catch(() => {})
  }, [simpleMode, brainTarget, remoteBrainUrl, connectToken])

  async function pickExport() {
    const d = await api.pickDirectory()
    if (d) setSettingsExportDir(d)
  }

  async function brainExport() {
    if (!exportSnap || !settingsExportDir) return
    try {
      const r = await api.brainExport(exportSnap, settingsExportDir)
      toast({ kind: 'success', title: `Wyeksportowano ${r.count} notatek`, detail: r.dir })
    } catch (e) {
      toast({ kind: 'error', title: 'Eksport nieudany', detail: (e as Error).message })
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-[26px] font-bold tracking-tight text-grad">{labels.settingsTitle}</h1>
      <p className="mb-6 text-sm text-ink-dim">{labels.settingsLead}</p>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink">{labels.simpleMode}</div>
            <p className="mt-1 text-xs text-ink-dim">{labels.simpleModeHint}</p>
          </div>
          <Toggle
            checked={simpleMode}
            onChange={setSimpleMode}
            aria-label={labels.simpleMode}
          />
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Languages className="h-4 w-4 text-mint" /> {labels.uiLocale}
        </div>
        <p className="mb-3 text-xs text-ink-dim">{labels.uiLocaleHint}</p>
        <div
          className="flex flex-wrap gap-1 rounded-xl border border-line bg-abyss/60 p-1"
          role="radiogroup"
          aria-label={labels.uiLocale}
        >
          {UI_LOCALES.map((id) => {
            const active = uiLocale === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setUiLocale(id)}
                className={
                  active
                    ? 'flex-1 rounded-lg border border-mint/35 bg-mint/15 px-3 py-2 text-sm font-medium text-ink shadow-[0_0_16px_-6px_var(--color-mint)]'
                    : 'flex-1 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-ink-dim hover:bg-white/5 hover:text-ink'
                }
              >
                {localeLabels[id]}
              </button>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Palette className="h-4 w-4 text-mint" /> {labels.colorScheme}
        </div>
        <p className="mb-3 text-xs text-ink-dim">{labels.colorSchemeHint}</p>
        <div
          className="flex flex-wrap gap-1 rounded-xl border border-line bg-abyss/60 p-1"
          role="radiogroup"
          aria-label={labels.colorScheme}
        >
          {COLOR_SCHEMES.map((id) => {
            const active = colorScheme === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setColorScheme(id)}
                className={
                  active
                    ? 'flex-1 rounded-lg border border-mint/35 bg-mint/15 px-3 py-2 text-sm font-medium text-ink shadow-[0_0_16px_-6px_var(--color-mint)]'
                    : 'flex-1 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-ink-dim hover:bg-white/5 hover:text-ink'
                }
              >
                {schemeLabels[id]}
              </button>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Minimize2 className="h-4 w-4 text-mint" /> {labels.systemTray}
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">{labels.openAtLogin}</div>
              <p className="mt-1 text-xs text-ink-dim">{labels.openAtLoginHint}</p>
            </div>
            <Toggle checked={openAtLogin} onChange={setOpenAtLogin} aria-label={labels.openAtLogin} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">{labels.closeToTray}</div>
              <p className="mt-1 text-xs text-ink-dim">{labels.closeToTrayHint}</p>
            </div>
            <Toggle checked={closeToTray} onChange={setCloseToTray} aria-label={labels.closeToTray} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">{labels.minimizeToTray}</div>
              <p className="mt-1 text-xs text-ink-dim">{labels.minimizeToTrayHint}</p>
            </div>
            <Toggle checked={minimizeToTray} onChange={setMinimizeToTray} aria-label={labels.minimizeToTray} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">{labels.floatingMonitorOnMinimize}</div>
              <p className="mt-1 text-xs text-ink-dim">{labels.floatingMonitorOnMinimizeHint}</p>
            </div>
            <Toggle
              checked={floatingMonitorOnMinimize}
              onChange={setFloatingMonitorOnMinimize}
              aria-label={labels.floatingMonitorOnMinimize}
            />
          </div>
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Handshake className="h-4 w-4 text-mint" /> {labels.handshake}
        </div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">{labels.handshakeEnabled}</div>
            <p className="mt-1 text-xs text-ink-dim">{labels.handshakeEnabledHint}</p>
          </div>
          <Toggle
            checked={handshakeEnabled}
            onChange={setHandshakeEnabled}
            aria-label={labels.handshakeEnabled}
          />
        </div>
        <div className="mb-1 text-sm font-medium text-ink">{labels.handshakePhrase}</div>
        <p className="mb-3 text-xs text-ink-dim">{labels.handshakePhraseHint}</p>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={phraseDraft}
              onChange={(e) => {
                setPhraseDraft(e.target.value)
                if (phraseError) setPhraseError(null)
              }}
              placeholder={handshakePhrase || labels.handshakePlaceholder}
              aria-label={labels.handshakePhrase}
              autoComplete="off"
              spellCheck={false}
              disabled={!handshakeEnabled}
              className={!handshakeEnabled ? 'opacity-50' : undefined}
            />
            {handshakeEnabled && phraseDraft.trim() ? (
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {labels.handshakePhrasePreview(phraseDraft.trim())}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            onClick={() => void saveHandshakePhrase()}
            disabled={!handshakeEnabled || phraseSaving || phraseDraft.trim() === handshakePhrase}
          >
            {phraseSaving ? <Spinner className="h-4 w-4" /> : null}
            {labels.handshakePhraseSave}
          </Button>
        </div>
        {phraseError ? <p className="mt-2 text-xs text-rose-300/90">{phraseError}</p> : null}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{labels.handshakeRefreshHint}</p>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Brain className="h-4 w-4 text-mint" /> {labels.autoCheckpoint}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-ink">{labels.autoCheckpointEnabled}</div>
            <p className="mt-1 text-xs text-ink-dim">{labels.autoCheckpointEnabledHint}</p>
          </div>
          <Toggle
            checked={autoCheckpointEnabled}
            onChange={setAutoCheckpointEnabled}
            aria-label={labels.autoCheckpointEnabled}
          />
        </div>
      </GlassCard>

      <HealthCheck />

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Vault className="h-4 w-4 text-mint" /> {labels.vault}
        </div>
        {vault.open ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-dim">
              <span className="font-medium text-ink">{vault.name}</span>
              <div className="font-mono text-xs text-ink-faint">{vault.path}</div>
              <p className="mt-2 text-xs text-ink-dim">
                {labels.knowledgePathOpen(vault.path ?? vault.name ?? '')}
              </p>
            </div>
            <Button variant="danger" onClick={lockVault}>
              <Lock className="h-4 w-4" /> {labels.lockVault}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">{labels.knowledgePathLocked}</p>
        )}
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Brain className="h-4 w-4 text-mint" /> {labels.brainBridge}
        </div>
        <p className="mb-4 text-xs text-ink-dim">{labels.brainBridgeLead}</p>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={labels.snapshot}>
            <select
              value={exportSnap}
              onChange={(e) => setExportSnap(e.target.value)}
              className="no-drag w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-ink outline-none"
            >
              {snapshots.length === 0 && <option value="">— brak —</option>}
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.source.label} · {s.stats.conversations} czatów · {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button variant="soft" onClick={pickExport}>
              <FolderOpen className="h-4 w-4" /> {labels.outDir}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={settingsExportDir} onChange={(e) => setSettingsExportDir(e.target.value)} placeholder="…/brain/data/vault/sessions" />
          <Button onClick={brainExport} disabled={!exportSnap || !settingsExportDir}>
            <Brain className="h-4 w-4" /> {labels.exportNotes}
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Plug className="h-4 w-4 text-cyan" /> {labels.mcpClients}
        </div>
        <p className="mb-4 text-xs text-ink-dim">{labels.mcpClientsLead}</p>
        <div className="space-y-2">
          {ALL_CLIENTS.map((id) => {
            const c = clients.find((x) => x.id === id)
            const detected = !!c?.configExists
            const override = connectClientOverride[id]
            const visible = override ?? detected
            const overridden = override !== undefined
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3.5 py-2.5"
              >
                <ClientIcon id={id} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{c?.label ?? id}</div>
                  <div className="text-[11px]" style={{ color: detected ? '#34d399' : '#6b7390' }}>
                    {detected ? labels.detectedOnMachine : labels.notFound}
                    {overridden && <span className="text-ink-faint"> · {labels.customOverride}</span>}
                  </div>
                </div>
                {overridden && (
                  <button
                    onClick={() => resetConnectClient(id)}
                    className="no-drag rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/8 hover:text-ink"
                    title={labels.resetAutoDetect}
                    aria-label={labels.resetAutoDetect}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <Toggle
                  checked={visible}
                  onChange={(v) => setConnectClientVisible(id, v)}
                  aria-label={`Pokaż ${c?.label ?? id} w Connect`}
                />
              </div>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileArchive className="h-4 w-4 text-mint" /> {labels.snapshots}
          </div>
          {snapshots.length > 0 && vault.open && (
            <Button variant="soft" onClick={verifyIntegrity} disabled={verifying}>
              {verifying ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {labels.verifyIntegrity}
            </Button>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-dim">
          {vault.open
            ? snapshots.length === 0
              ? labels.snapshotsEmpty
              : labels.snapshotsCount(snapshots.length)
            : labels.unlockVaultForSnapshots}
        </p>
        {vault.open && snapshots.length > 0 && (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
            {snapshots.slice(0, 20).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-ink">{s.source.label}</span>
                    <span className="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint">
                      {s.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-ink-dim">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {relativeTime(s.createdAt)}
                    </span>
                    <span>
                      {s.stats.files} plików · {humanBytes(s.stats.bytes)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {snapshots.length > 20 && (
              <li className="px-3 py-1 text-[11px] italic text-ink-faint">
                {labels.moreSnapshots(snapshots.length - 20)}
              </li>
            )}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Shield className="h-4 w-4 text-mint" /> {labels.antivirusTitle}
        </div>
        <p className="mb-2 text-xs text-ink-dim">{labels.antivirusLead}</p>
        <p className="mb-3 text-xs text-ink-dim">{labels.antivirusWhy}</p>
        <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">{labels.antivirusSigningNote}</p>
        {!isMock && (
          <Button
            type="button"
            variant="soft"
            onClick={() => {
              void api.revealInstallDir().catch(() => {})
            }}
          >
            <FolderOpen className="h-4 w-4" /> {labels.antivirusOpenInstallFolder}
          </Button>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-mint" /> {labels.securityAbout}
        </div>
        <ul className="space-y-1.5 text-xs text-ink-dim">
          <li>• AES-256-GCM — szyfrowanie uwierzytelnione, losowy IV na blob.</li>
          <li>• scrypt (N=2¹⁷) — pochodna klucza z hasła.</li>
          <li>• Content-addressed blob store — identyczne pliki trzymane raz.</li>
          <li>• {labels.securityPortability}</li>
          {appVersion && (
            <li className="text-ink-faint">{labels.securityAboutCli(appVersion)}</li>
          )}
        </ul>
        {isMock && (
          <p className="mt-3 rounded-lg border border-amber/20 bg-amber/10 p-2 text-[11px] text-amber">
            {labels.previewMode}
          </p>
        )}
      </GlassCard>
    </div>
  )
}
