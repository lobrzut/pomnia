import { describe, expect, it } from 'vitest'
import { ollamaNeedsMacOsRelay, ollamaUrlLooksLocal } from './ollama.js'

describe('ollamaUrlLooksLocal', () => {
  it('treats empty and loopback as local install', () => {
    expect(ollamaUrlLooksLocal('')).toBe(true)
    expect(ollamaUrlLooksLocal('http://127.0.0.1:11434')).toBe(true)
    expect(ollamaUrlLooksLocal('http://localhost:11434')).toBe(true)
  })

  it('treats a LAN daemon as found-when-reachable, not as a missing Homebrew install', () => {
    expect(ollamaUrlLooksLocal('http://192.168.1.201:11434')).toBe(false)
  })
})

describe('ollamaNeedsMacOsRelay', () => {
  it('is only for macOS non-loopback URLs', () => {
    expect(ollamaNeedsMacOsRelay('http://192.168.1.201:11434', 'darwin')).toBe(true)
    expect(ollamaNeedsMacOsRelay('http://127.0.0.1:11434', 'darwin')).toBe(false)
    expect(ollamaNeedsMacOsRelay('http://192.168.1.201:11434', 'linux')).toBe(false)
  })
})
