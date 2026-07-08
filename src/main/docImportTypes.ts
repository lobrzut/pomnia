export interface DocImportResult {
  docId: string
  sourcePath: string
  extractedPath: string
  format: string
  pages: number
  chunks: number
  sparse: boolean
  extractionPath: string
  suggestOcr: boolean
  indexed: boolean
  pendingIndex: boolean
  brainRunning: boolean
  brainAutoStarted: boolean
  encrypted: boolean
}
