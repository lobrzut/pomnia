import { useEffect, useState } from 'react'
import { Brain, Clock, FileArchive, FolderOpen, Lock, Minimize2, Plug, RotateCcw, ShieldCheck, Vault } from 'lucide-react'
import { Button, Field, GlassCard, Input, Spinner, Toggle } from '../components/ui'
import { ClientIcon } from '../components/ClientIcon'
import { api, isMock } from '../lib/api'
import { humanBytes, relativeTime } from '../lib/format'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'
import type { ClientId, ClientStatus } from '../lib/types'

const ALL_CLIENTS: ClientId[] = ['claude-code', 'cursor', 'antigravity', 'claude-desktop', 'vscode', 'windsurf', 'hermes']

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
    setSettingsExportDir,
    simpleMode,
    setSimpleMode,
    minimizeToTray,
    closeToTray,
    setMinimizeToTray,
    setCloseToTray
  } = useStore()
  const labels = uiLabels(simpleMode)
  const [exportSnap, setExportSnap] = useState(snapshots[0]?.id ?? '')
  const [clients, setClients] = useState<ClientStatus[]>([])
  const [verifying, setVerifying] = useState(false)

  async function verifyIntegrity() {
    setVerifying(true)
    try {
      const r = await api.verify()
      toast({
        kind: r.ok ? 'success' : 'error',
        title: r.ok ? 'Vault integrity OK' : `${r.errors.length} integrity error(s)`,
        detail: `${r.checked} encrypted blobs checked`,
      })
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    // Detection (configExists) is independent of the brain URL — we only read
    // local client config files here; the URL is just to satisfy the signature.
    api
      .connectStatus('http://brain.example.local:7862')
      .then((r) => setClients(r.clients))
      .catch(() => {})
  }, [])

  async function pickExport() {
    const d = await api.pickDirectory()
    if (d) setSettingsExportDir(d)
  }

  async function brainExport() {
    if (!exportSnap || !settingsExportDir) return
    try {
      const r = await api.brainExport(exportSnap, settingsExportDir)
      toast({ kind: 'success', title: `Exported ${r.count} notes`, detail: r.dir })
    } catch (e) {
      toast({ kind: 'error', title: 'Export failed', detail: (e as Error).message })
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-[26px] font-bold tracking-tight text-grad">Settings</h1>
      <p className="mb-6 text-sm text-ink-dim">Vault, integrations, and security.</p>

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
          <Minimize2 className="h-4 w-4 text-iris" /> {simpleMode ? 'Zasobnik systemowy' : 'System tray'}
        </div>
        <div className="space-y-4">
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
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <Vault className="h-4 w-4 text-iris" /> Vault
        </div>
        {vault.open ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink-dim">
              <span className="font-medium text-ink">{vault.name}</span>
              <div className="font-mono text-xs text-ink-faint">{vault.path}</div>
            </div>
            <Button variant="danger" onClick={lockVault}>
              <Lock className="h-4 w-4" /> Lock
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-faint">No vault open.</p>
        )}
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Brain className="h-4 w-4 text-violet" /> Brain bridge
        </div>
        <p className="mb-4 text-xs text-ink-dim">
          Export a snapshot's conversations as markdown notes compatible with your Brain vault ingest format — feed the
          RAG inbox so nothing gets wasted across sessions.
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Snapshot">
            <select
              value={exportSnap}
              onChange={(e) => setExportSnap(e.target.value)}
              className="no-drag w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-ink outline-none"
            >
              {snapshots.length === 0 && <option value="">— none —</option>}
              {snapshots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.source.label} · {s.stats.conversations} chats · {s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <Button variant="soft" onClick={pickExport}>
              <FolderOpen className="h-4 w-4" /> Out dir
            </Button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={settingsExportDir} onChange={(e) => setSettingsExportDir(e.target.value)} placeholder="…/brain/data/vault/sessions" />
          <Button onClick={brainExport} disabled={!exportSnap || !settingsExportDir}>
            <Brain className="h-4 w-4" /> Export
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <Plug className="h-4 w-4 text-cyan" /> MCP clients
        </div>
        <p className="mb-4 text-xs text-ink-dim">
          Choose which clients appear in the Connect tab. Detected clients show by default — pin one you haven't set up
          yet, or hide ones you don't use.
        </p>
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
                    {detected ? 'Detected on this machine' : 'Not found'}
                    {overridden && <span className="text-ink-faint"> · custom</span>}
                  </div>
                </div>
                {overridden && (
                  <button
                    onClick={() => resetConnectClient(id)}
                    className="no-drag rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-white/8 hover:text-ink"
                    title="Reset to auto-detect"
                    aria-label="Reset to auto-detect"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
                <Toggle
                  checked={visible}
                  onChange={(v) => setConnectClientVisible(id, v)}
                  aria-label={`Show ${c?.label ?? id} in Connect`}
                />
              </div>
            )
          })}
        </div>
      </GlassCard>

      <GlassCard className="mb-4 p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <FileArchive className="h-4 w-4 text-violet" /> Snapshots
          </div>
          {snapshots.length > 0 && vault.open && (
            <Button variant="soft" onClick={verifyIntegrity} disabled={verifying}>
              {verifying ? <Spinner className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify integrity
            </Button>
          )}
        </div>
        <p className="mb-3 text-xs text-ink-dim">
          {vault.open
            ? snapshots.length === 0
              ? 'No snapshots yet — run a backup from the Dashboard to create your first sealed point-in-time capture.'
              : `${snapshots.length} sealed point-in-time captures. Create new snapshots from the Dashboard.`
            : 'Unlock a vault to see snapshots.'}
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
                      {s.stats.files} files · {humanBytes(s.stats.bytes)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
            {snapshots.length > 20 && (
              <li className="px-3 py-1 text-[11px] italic text-ink-faint">
                + {snapshots.length - 20} more…
              </li>
            )}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-mint" /> Security & about
        </div>
        <ul className="space-y-1.5 text-xs text-ink-dim">
          <li>• AES-256-GCM authenticated encryption, per-blob random IV.</li>
          <li>• scrypt (N=2¹⁷) key derivation from your passphrase.</li>
          <li>• Content-addressed, deduplicated blob store — identical files stored once.</li>
          <li>• Fully portable: copy the .pomnia folder to any OS and unlock.</li>
          <li className="text-ink-faint">Pomnia v0.1.0 · engine runs headless via the CLI too.</li>
        </ul>
        {isMock && (
          <p className="mt-3 rounded-lg border border-amber/20 bg-amber/10 p-2 text-[11px] text-amber">
            Preview mode (no Electron backend) — data shown is illustrative.
          </p>
        )}
      </GlassCard>
    </div>
  )
}
