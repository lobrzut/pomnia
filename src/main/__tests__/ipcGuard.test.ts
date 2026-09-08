import { describe, expect, it } from 'vitest'

import {
  isAllowedRendererNavigation,
  isTrustedRendererUrl,
  roleForChannel,
} from '../ipcGuard.js'

describe('ipcGuard URL policy (F20)', () => {
  it('trusts packaged renderer file URLs', () => {
    expect(
      isTrustedRendererUrl('file:///C:/Users/x/AppData/Pomnia/out/renderer/index.html'),
    ).toBe(true)
    expect(
      isTrustedRendererUrl('file:///C:/app/resources/app.asar/out/renderer/index.html#/brain'),
    ).toBe(true)
  })

  it('trusts the Vite dev server origin when configured', () => {
    expect(
      isTrustedRendererUrl('http://localhost:5173/', {
        rendererDevUrl: 'http://localhost:5173',
      }),
    ).toBe(true)
    expect(
      isTrustedRendererUrl('http://localhost:5173/#/floating-monitor', {
        rendererDevUrl: 'http://localhost:5173',
      }),
    ).toBe(true)
    expect(
      isTrustedRendererUrl('http://evil.example/', {
        rendererDevUrl: 'http://localhost:5173',
      }),
    ).toBe(false)
  })

  it('rejects blank, remote, and exotic schemes', () => {
    expect(isTrustedRendererUrl('about:blank')).toBe(false)
    expect(isTrustedRendererUrl('https://evil.example/pwn')).toBe(false)
    expect(isTrustedRendererUrl('javascript:alert(1)')).toBe(false)
    expect(isTrustedRendererUrl('file:///tmp/other.html')).toBe(false)
  })

  it('allows only trusted targets for in-window navigation', () => {
    expect(
      isAllowedRendererNavigation('file:///app/out/renderer/index.html', {}),
    ).toBe(true)
    expect(isAllowedRendererNavigation('https://example.com', {})).toBe(false)
  })

  it('maps channels to window roles', () => {
    expect(roleForChannel('vault:lock')).toBe('main')
    expect(roleForChannel('import:toVault')).toBe('main')
    expect(roleForChannel('floating-monitor:hide')).toBe('floating')
    expect(roleForChannel('profile-preview:save')).toBe('profile-preview')
    expect(roleForChannel('activity:get')).toBe('any-trusted')
  })
})
