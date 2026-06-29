import type { BackupOptions, DetectedSource, SourceId } from '../model.js'
import { descriptorFor } from '../locations.js'
import { currentOS, homeDir } from '../platform.js'
import { dirSize, pathExists, walk } from '../fsutil.js'
import { DEFAULT_MAX_FILE, type CollectedFile } from './types.js'

/** Walk a source root per its descriptor, flagging path-sensitive configs. */
export async function collectFilesFromDescriptor(
  id: SourceId,
  root: string,
  opts: BackupOptions
): Promise<CollectedFile[]> {
  const desc = descriptorFor(id)
  if (!desc) return []
  const exclude = opts.skipCaches === false ? [] : desc.exclude
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE
  const files: CollectedFile[] = []
  for await (const f of walk(root, { exclude, keepTop: desc.keepTop, maxFileBytes })) {
    const sensitive = desc.pathSensitive.some(
      (ps) => f.relPath === ps || f.relPath.startsWith(ps + '/') || f.relPath.startsWith(ps)
    )
    files.push({ ...f, pathSensitive: sensitive })
  }
  return files
}

/** Standard detection: existence + payload size + descriptor notes. */
export async function baseDetect(id: SourceId): Promise<DetectedSource> {
  const desc = descriptorFor(id)!
  const os = currentOS()
  const root = desc.root(os, homeDir()) ?? ''
  const installed = root ? await pathExists(root) : false
  const sizeBytes = installed
    ? await dirSize(root, { exclude: desc.exclude, keepTop: desc.keepTop, maxFileBytes: DEFAULT_MAX_FILE })
    : 0
  return {
    id,
    label: desc.label,
    strategy: desc.strategy,
    installed,
    root,
    os,
    sizeBytes,
    notes: desc.notes ? [...desc.notes] : undefined
  }
}
