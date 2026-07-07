import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Boxes, FolderOpen, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { Button, Field, Input } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../store/useStore'

export default function VaultGate() {
  const { createVault, openVault, vaultLastPath, setVaultLastPath } = useStore()
  const [mode, setMode] = useState<'unlock' | 'create'>('unlock')
  const [path, setPath] = useState(vaultLastPath)
  const [name, setName] = useState('My Vault')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (vaultLastPath && !path) setPath(vaultLastPath)
  }, [vaultLastPath, path])

  async function pick() {
    const dir = await api.pickDirectory()
    if (dir) {
      setPath(dir)
      setVaultLastPath(dir)
    }
  }

  async function submit() {
    if (!path || !pass) return
    if (mode === 'create' && pass !== confirm) return
    setVaultLastPath(path)
    setBusy(true)
    if (mode === 'create') await createVault(path, name, pass)
    else await openVault(path, pass)
    setBusy(false)
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void submit()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex items-center justify-center bg-void/70 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.94, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.45 }}
        className="glass w-[440px] rounded-3xl p-7"
      >
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl accent-grad ring-glow">
            <Boxes className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-grad">Pomnia Vault</h1>
            <p className="text-xs text-ink-dim">Your AI memory — encrypted, portable, yours.</p>
          </div>
        </div>

        <div className="mb-5 flex rounded-xl border border-white/10 bg-black/20 p-1">
          {(['unlock', 'create'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`relative flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
                mode === m ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
              }`}
            >
              {mode === m && (
                <motion.div layoutId="gate-tab" className="absolute inset-0 rounded-lg accent-grad opacity-90" />
              )}
              <span className="relative flex items-center justify-center gap-1.5">
                {m === 'unlock' ? <KeyRound className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                {m === 'unlock' ? 'Unlock' : 'Create'}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Field label={mode === 'create' ? 'New vault folder' : 'Vault folder'}>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => {
                  setPath(e.target.value)
                  setVaultLastPath(e.target.value)
                }}
                onKeyDown={onEnter}
                placeholder="…/MyVault.pomnia"
              />
              <Button variant="soft" onClick={pick}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </Field>

          {mode === 'create' && (
            <Field label="Vault name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}

          <Field label="Passphrase">
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={onEnter} placeholder="••••••••••" />
          </Field>

          {mode === 'create' && (
            <Field label="Confirm passphrase">
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={onEnter}
                placeholder="••••••••••"
              />
            </Field>
          )}

          {mode === 'create' && pass && confirm && pass !== confirm && (
            <p className="text-xs text-rose">Passphrases don't match.</p>
          )}

          <Button onClick={submit} disabled={busy || !path || !pass} className="w-full">
            <ShieldCheck className="h-4 w-4" />
            {busy ? 'Working…' : mode === 'create' ? 'Create encrypted vault' : 'Unlock vault'}
          </Button>

          <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-ink-faint">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            AES-256-GCM · scrypt key derivation · passphrase never stored. Lose it and the vault is unrecoverable.
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}
