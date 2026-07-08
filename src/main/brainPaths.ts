import { join } from 'node:path'
import { app } from 'electron'

export function brainCoreDataDir(): string {
  return join(app.getPath('userData'), 'brain-core-data')
}
