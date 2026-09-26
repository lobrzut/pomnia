// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Mini used to extend electron-builder.yml. electron-builder concatenates
 * extraResources, so the desktop Brain runtime (resources/brain-core, ~25 MB)
 * landed in Mini even though Mini never starts it. These assertions load the
 * merged config the packager actually uses — not a hand-rolled merge.
 *
 * Pack-time check (this file does not build a zip):
 *   unzip -l release/mini/PomniaMini-*-portable.zip | grep resources/brain-core
 * Expect no matches. After a desktop pack,
 * release/win-unpacked/resources/brain-core/embedded.js should exist.
 */

const require = createRequire(import.meta.url)
const { getConfig } = require('app-builder-lib/out/util/config/config.js') as {
  getConfig: (projectDir: string, configPath: string | null, configFromOptions: null) => Promise<BuilderConfig>
}

interface FileSet {
  from?: string
  to?: string
  filter?: string[] | string
}

interface BuilderConfig {
  appId?: string
  productName?: string
  publish?: { provider?: string; owner?: string; repo?: string } | null
  extraResources?: Array<string | FileSet>
  files?: Array<string | FileSet>
  asarUnpack?: string[]
  directories?: { output?: string; buildResources?: string }
  win?: { target?: string[]; executableName?: string; artifactName?: string }
  nsis?: { include?: string; oneClick?: boolean }
  portable?: { unpackDirName?: string }
  mac?: { artifactName?: string }
  linux?: { target?: string[]; executableName?: string }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sharedResources = ['tessdata', 'trayIcon.png', 'trayIcon@2x.png', 'ollama-relay.py']

function destinations(list: BuilderConfig['extraResources']): string[] {
  return (list ?? []).map((item) => (typeof item === 'string' ? item : (item.to ?? item.from ?? '')))
}

function sources(list: BuilderConfig['files']): string[] {
  return (list ?? []).flatMap((item) => (typeof item === 'string' || !item.from ? [] : [item.from]))
}

function filters(list: BuilderConfig['files']): string[] {
  const out: string[] = []
  for (const item of list ?? []) {
    if (typeof item === 'string') out.push(item)
    else if (Array.isArray(item.filter)) out.push(...item.filter)
    else if (typeof item.filter === 'string') out.push(item.filter)
  }
  return out
}

describe('electron-builder flavour configs', () => {
  it('desktop embeds the Brain runtime and Mini does not', async () => {
    const desktop = await getConfig(root, join(root, 'electron-builder.yml'), null)
    const byDefault = await getConfig(root, null, null)
    const mini = await getConfig(root, join(root, 'electron-builder.mini.yml'), null)

    expect(destinations(desktop.extraResources)).toEqual([...sharedResources, 'brain-core'])
    expect(destinations(byDefault.extraResources)).toEqual(destinations(desktop.extraResources))
    expect(destinations(mini.extraResources)).toEqual(sharedResources)
    expect(JSON.stringify(mini.extraResources)).not.toContain('brain-core-runtime')

    const brain = (desktop.extraResources ?? []).find(
      (item) => typeof item !== 'string' && item.to === 'brain-core',
    )
    expect(brain).toMatchObject({ from: 'build/brain-core-runtime-v2', to: 'brain-core' })

    expect(desktop.productName).toBe('Pomnia')
    expect(desktop.appId).toBe('ai.pomnia.app')
    expect(mini.productName).toBe('PomniaMini')
    expect(mini.appId).toBe('ai.pomnia.mini')

    expect(desktop.directories?.output).toBe('release')
    expect(mini.directories?.output).toBe('release/mini')
    expect(desktop.directories?.buildResources).toBe('resources')
    expect(mini.directories?.buildResources).toBe('resources')

    expect(desktop.win?.target).toEqual(['nsis'])
    expect(desktop.win?.executableName).toBe('Pomnia')
    expect(desktop.win?.artifactName).toBe('${productName}-${version}-setup.${ext}')
    expect(desktop.nsis?.include).toBe('installer.nsh')
    expect(desktop.nsis?.oneClick).toBe(false)
    expect(desktop.portable).toBeUndefined()

    expect(mini.win?.target).toEqual(['portable', 'zip'])
    expect(mini.win?.executableName).toBe('PomniaMini')
    expect(mini.win?.artifactName).toBe('${productName}-${version}-portable.${ext}')
    expect(mini.nsis).toBeUndefined()
    expect(mini.portable?.unpackDirName).toBe('PomniaMini')
    expect(mini.publish).toBeNull()
    expect(desktop.publish).toMatchObject({ provider: 'github', owner: 'lobrzut', repo: 'pomnia' })

    // Same asar file list. Mini still imports @pomnia/brain-core/vault; the
    // staged runtime is the extraResources entry, not this copy.
    expect(sources(mini.files)).toEqual(sources(desktop.files))
    expect(sources(desktop.files)).toContain('packages/brain-core')
    expect(filters(desktop.files)).toContain('!**/node_modules/onnxruntime-web/**')
    expect(filters(mini.files)).toContain('!**/node_modules/onnxruntime-web/**')
    expect(mini.asarUnpack).toEqual(desktop.asarUnpack)

    expect(desktop.mac?.artifactName).toBe('${productName}-${version}-${arch}.${ext}')
    expect(mini.mac?.artifactName).toBe(desktop.mac?.artifactName)
    expect(desktop.linux?.target).toEqual(['AppImage', 'deb'])
    expect(mini.linux?.executableName).toBe('Pomnia')
  })
})
