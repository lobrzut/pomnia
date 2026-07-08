declare module 'mammoth' {
  export interface MammothResult {
    value: string
    messages: unknown[]
  }

  export function convertToMarkdown(input: { buffer: Buffer }): Promise<MammothResult>
}
