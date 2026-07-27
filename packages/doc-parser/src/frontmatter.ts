// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
export interface ExtractedFrontmatter {
  source_file: string
  source_sha256: string
  format: string
  extraction_tier: number
  extraction_sparse: boolean
  /** Tier 1 parser id shown in UI — e.g. unpdf, mammoth, passthrough. */
  extraction_path: string
  pages: number
  imported_at: string
  imported_via: string
}

function yamlScalar(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (/[:#\n]/.test(value)) return JSON.stringify(value)
  return value
}

/** Wrap extracted body with YAML frontmatter for vault/library/extracted. */
export function buildExtractedMarkdown(body: string, meta: ExtractedFrontmatter): string {
  const lines = [
    '---',
    `source_file: ${yamlScalar(meta.source_file)}`,
    `source_sha256: ${yamlScalar(meta.source_sha256)}`,
    `format: ${yamlScalar(meta.format)}`,
    `extraction_tier: ${meta.extraction_tier}`,
    `extraction_sparse: ${meta.extraction_sparse}`,
    `extraction_path: ${yamlScalar(meta.extraction_path)}`,
    `pages: ${meta.pages}`,
    `imported_at: ${yamlScalar(meta.imported_at)}`,
    `imported_via: ${yamlScalar(meta.imported_via)}`,
    '---',
    '',
    body,
  ]
  return lines.join('\n')
}
