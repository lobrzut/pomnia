// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, KeyRound, ShieldCheck, Sparkles } from 'lucide-react'
import { AppLogo } from '../components/AppLogo'
import { Button, Field, Input } from '../components/ui'
import { api } from '../lib/api'
import { uiLabels } from '../lib/labels'
import { useStore } from '../store/useStore'

export default function VaultGate() {
  const labels = uiLabels()
  const { createVault, openVault, vaultLastPath, setVaultLastPath } = useStore()
  const [mode, setMode] = useState<'unlock' | 'create'>('unlock')
  const [path, setPath] = useState(vaultLastPath)
  const [name, setName] = useState(labels.vaultGateDefaultName)
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
          <AppLogo size="lg" glow />
          <div className="min-w-0 leading-none">
            <h1 className="text-lg font-bold leading-tight tracking-tight text-grad">{labels.vaultGateTitle}</h1>
            <p className="mt-1.5 text-xs leading-snug text-ink-dim">{labels.vaultGateLead}</p>
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
                {m === 'unlock' ? labels.vaultGateUnlockTab : labels.vaultGateCreateTab}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Field label={mode === 'create' ? labels.onboardingVaultNewFolder : labels.onboardingVaultFolder}>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => {
                  setPath(e.target.value)
                  setVaultLastPath(e.target.value)
                }}
                onKeyDown={onEnter}
                placeholder={labels.vaultPathPlaceholder}
              />
              <Button variant="soft" onClick={pick}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </Field>

          {mode === 'create' && (
            <Field label={labels.vaultGateName}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}

          <Field label={labels.onboardingPassphrase}>
            <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={onEnter} placeholder="••••••••••" />
          </Field>

          {mode === 'create' && (
            <Field label={labels.onboardingConfirmPass}>
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
            <p className="text-xs text-rose">{labels.onboardingPassMismatch}</p>
          )}

          <Button onClick={submit} disabled={busy || !path || !pass} className="w-full">
            <ShieldCheck className="h-4 w-4" />
            {busy
              ? labels.dashboardWorking
              : mode === 'create'
                ? labels.vaultGateCreateSubmit
                : labels.vaultGateUnlockSubmit}
          </Button>

          <p className="flex items-center gap-1.5 text-[11px] leading-relaxed text-ink-faint">
            <ShieldCheck className="h-3 w-3 shrink-0" />
            {labels.onboardingVaultCryptoHint}
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}
