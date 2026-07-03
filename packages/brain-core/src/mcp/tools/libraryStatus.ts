/**
 * MCP tool: library_status
 *
 * Small informational tool — reports counts from library.db and files on disk.
 * Used by agents to sanity-check "is the index fresh / is there anything in
 * there" before firing search_library.
 */

import type Database from 'better-sqlite3'

export const libraryStatusSchema = {
  type: 'object' as const,
  properties: {},
}

export interface LibraryStatusDeps {
  db: Database.Database
}

interface CountRow {
  n: number
}

export async function runLibraryStatus(
  _args: unknown,
  deps: LibraryStatusDeps,
): Promise<string> {
  const chunkCount = (deps.db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as CountRow).n
  const fileCount = (deps.db
    .prepare('SELECT COUNT(DISTINCT pdf_path) AS n FROM chunks')
    .get() as CountRow).n

  // Sample of file names for a "yes there's stuff here" signal.
  const sample = deps.db
    .prepare('SELECT DISTINCT pdf_name FROM chunks ORDER BY pdf_name LIMIT 10')
    .all() as Array<{ pdf_name: string }>

  return JSON.stringify({
    files_indexed: fileCount,
    chunks: chunkCount,
    sample_names: sample.map((r) => r.pdf_name),
  })
}
