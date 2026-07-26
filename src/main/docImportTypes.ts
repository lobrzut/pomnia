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
  indexError?: string
  encrypted: boolean
}

/** Result of on-demand OCR + optional single-doc re-index. */
export interface DocOcrResult extends DocImportResult {
  ocrMethod: 'tesseract' | 'ollama-vision' | 'none'
  ocrPages: number
}
