// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import { deriveVaultWhere, hostPlace, resolveVaultLocation } from './vaultLocation.js'

describe('hostPlace', () => {
  it('defaults to vendor-agnostic Pomnia host', () => {
    expect(hostPlace(null)).toBe('Na hoście Pomni')
    expect(hostPlace('')).toBe('Na hoście Pomni')
    expect(hostPlace('  ')).toBe('Na hoście Pomni')
  })

  it('uses POMNIA_HOST_LABEL when set', () => {
    expect(hostPlace('QNAP')).toBe('Na QNAP')
    expect(hostPlace('Synology')).toBe('Na Synology')
    expect(hostPlace('PC')).toBe('Na PC')
  })
})

describe('resolveVaultLocation', () => {
  it('is honest for the kvm e2e bind — never claims Sejf or QNAP by default', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_HOST_PATH: '/share/Container/pomnia-kvm/vault',
      POMNIA_VAULT_LABEL: 'katalog testowy (e2e)',
      POMNIA_VAULT_SMB: '(tylko lokalny katalog kontenera - ustaw Sejf)',
    })
    expect(loc.hostPath).toBe('/share/Container/pomnia-kvm/vault')
    expect(loc.label).toBe('katalog testowy (e2e)')
    expect(loc.smbPath).toMatch(/ustaw Sejf/)
    expect(loc.where).toMatch(/e2e/)
    expect(loc.where).toMatch(/nie share produkcyjny \(Sejf\)/)
    expect(loc.where).toMatch(/^Na hoście Pomni/)
    expect(loc.where).not.toMatch(/QNAP/i)
    expect(loc.where).not.toMatch(/Pomnia\\\\Sejf/)
  })

  it('prefixes e2e where with POMNIA_HOST_LABEL when set', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_HOST_LABEL: 'QNAP',
      POMNIA_VAULT_HOST_PATH: '/share/Container/pomnia-kvm/vault',
      POMNIA_VAULT_LABEL: 'katalog testowy (e2e)',
    })
    expect(loc.where).toMatch(/^Na QNAP, katalog testowy \(e2e\)/)
  })

  it('describes Sejf when UNC + host path say so (vendor-agnostic)', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_HOST_PATH: '/share/Pomnia/Sejf',
      POMNIA_VAULT_LABEL: 'Pomnia\\Sejf',
      POMNIA_VAULT_SMB: '\\\\192.168.1.150\\Pomnia\\Sejf',
    })
    expect(loc.where).toMatch(/^Na hoście Pomni: share/)
    expect(loc.where).toMatch(/Pomnia\\Sejf/)
    expect(loc.where).toContain('\\\\192.168.1.150\\Pomnia\\Sejf')
    expect(loc.where).not.toMatch(/QNAP/i)
  })

  it('describes Sejf with Synology host label', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_HOST_LABEL: 'Synology',
      POMNIA_VAULT_HOST_PATH: '/volume1/Pomnia/Sejf',
      POMNIA_VAULT_LABEL: 'Pomnia\\Sejf',
      POMNIA_VAULT_SMB: '\\\\nas\\Pomnia\\Sejf',
    })
    expect(loc.where).toMatch(/^Na Synology: share/)
  })

  it('honours an explicit POMNIA_VAULT_WHERE override', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_WHERE: 'Ręcznie ustawione.',
      POMNIA_VAULT_LABEL: 'katalog testowy (e2e)',
    })
    expect(loc.where).toBe('Ręcznie ustawione.')
  })
})

describe('deriveVaultWhere', () => {
  it('prefers e2e over a misleading UNC', () => {
    expect(
      deriveVaultWhere({
        label: 'katalog testowy (e2e)',
        smbPath: '\\\\192.168.1.150\\Pomnia\\Sejf',
        hostPath: '/share/Container/pomnia-kvm/vault',
      }),
    ).toMatch(/nie share produkcyjny \(Sejf\)/)
  })
})
