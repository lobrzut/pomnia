// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
declare module 'mammoth' {
  export interface MammothResult {
    value: string
    messages: unknown[]
  }

  export function convertToMarkdown(input: { buffer: Buffer }): Promise<MammothResult>
}
