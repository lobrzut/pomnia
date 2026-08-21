// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { describe, expect, it } from 'vitest'

import {
  deriveVaultWhere,
  looksLikeUnc,
  resolveVaultLocation,
  sanitizeSmbPath,
  sanitizeVaultLabel,
} from './vaultLocation.js'

describe('looksLikeUnc / sanitize', () => {
  it('accepts real UNC only', () => {
    expect(looksLikeUnc('\\\\192.168.1.150\\Pomnia\\Sejf')).toBe(true)
    expect(looksLikeUnc('//nas/Pomnia/Sejf')).toBe(true)
    expect(looksLikeUnc('(tylko lokalny katalog kontenera - ustaw Sejf)')).toBe(false)
    expect(looksLikeUnc('/share/Pomnia/Sejf')).toBe(false)
  })

  it('drops junk labels and fake SMB notes', () => {
    expect(sanitizeVaultLabel('katalog testowy (e2e)')).toBeNull()
    expect(sanitizeVaultLabel('Pomnia\\Sejf')).toBe('Pomnia\\Sejf')
    expect(sanitizeSmbPath('(tylko lokalny katalog kontenera - ustaw Sejf)')).toBeNull()
    expect(sanitizeSmbPath('\\\\192.168.1.150\\Pomnia\\Sejf')).toBe(
      '\\\\192.168.1.150\\Pomnia\\Sejf',
    )
  })
})

describe('resolveVaultLocation', () => {
  it('works with empty label/SMB — only real host path', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_HOST_PATH: '/share/Container/pomnia-kvm/vault',
    })
    expect(loc.hostPath).toBe('/share/Container/pomnia-kvm/vault')
    expect(loc.label).toBeNull()
    expect(loc.smbPath).toBeNull()
    expect(loc.where).toBeNull()
    expect(loc.path).toBe('/var/lib/pomnia/vault')
  })

  it('strips legacy e2e env junk instead of showing it', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_HOST_PATH: '/share/Container/pomnia-kvm/vault',
      POMNIA_VAULT_LABEL: 'katalog testowy (e2e)',
      POMNIA_VAULT_SMB: '(tylko lokalny katalog kontenera - ustaw Sejf)',
    })
    expect(loc.label).toBeNull()
    expect(loc.smbPath).toBeNull()
    expect(loc.where).toBeNull()
    expect(loc.hostPath).toBe('/share/Container/pomnia-kvm/vault')
  })

  it('keeps a real UNC for Windows operators', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_HOST_PATH: '/share/Pomnia/Sejf',
      POMNIA_VAULT_LABEL: 'Pomnia\\Sejf',
      POMNIA_VAULT_SMB: '\\\\192.168.1.150\\Pomnia\\Sejf',
    })
    expect(loc.smbPath).toBe('\\\\192.168.1.150\\Pomnia\\Sejf')
    expect(loc.label).toBe('Pomnia\\Sejf')
    expect(loc.hostPath).toBe('/share/Pomnia/Sejf')
    expect(loc.where).toBeNull()
  })

  it('honours an explicit POMNIA_VAULT_WHERE override', () => {
    const loc = resolveVaultLocation('/var/lib/pomnia/vault', {
      POMNIA_VAULT_WHERE: 'Ręcznie ustawione.',
      POMNIA_VAULT_LABEL: 'katalog testowy (e2e)',
    })
    expect(loc.where).toBe('Ręcznie ustawione.')
    expect(loc.label).toBeNull()
  })
})

describe('deriveVaultWhere', () => {
  it('does not invent e2e / Sejf comparison prose', () => {
    expect(
      deriveVaultWhere({
        label: 'katalog testowy (e2e)',
        smbPath: '\\\\192.168.1.150\\Pomnia\\Sejf',
        hostPath: '/share/Container/pomnia-kvm/vault',
      }),
    ).toBeNull()
  })
})
