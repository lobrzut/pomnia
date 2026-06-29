import { useState } from 'react'
import { Brain, FolderOpen, Lock, ShieldCheck, Vault } from 'lucide-react'
import { Button, Field, GlassCard, Input } from '../components/ui'
import { api, isMock } from '../lib/api'
import { useStore } from '../store/useStore'

export default function Settings() {
  const { vault, lockVault, snapshots, toast } = useStore()
  const [exportDir, setExportDir] = useState('')
  const [exportSnap, setExportSnap] = useState(snapshots[0]?.id ?? '')

  async function pickExport() {
    const d = await api.pickDirectory()
    if (d) setExportDir(d)
  }

  async function brainExport() {
    if (!exportSnap || !exportDir) return
    try {
      const r = await api.brainExport(exportSnap, exportDir)
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
          <Input value={exportDir} onChange={(e) => setExportDir(e.target.value)} placeholder="…/brain/data/vault/sessions" />
          <Button onClick={brainExport} disabled={!exportSnap || !exportDir}>
            <Brain className="h-4 w-4" /> Export
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-mint" /> Security & about
        </div>
        <ul className="space-y-1.5 text-xs text-ink-dim">
          <li>• AES-256-GCM authenticated encryption, per-blob random IV.</li>
          <li>• scrypt (N=2¹⁷) key derivation from your passphrase.</li>
          <li>• Content-addressed, deduplicated blob store — identical files stored once.</li>
          <li>• Fully portable: copy the .reliqua folder to any OS and unlock.</li>
          <li className="text-ink-faint">Reliqua v0.1.0 · engine runs headless via the CLI too.</li>
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
