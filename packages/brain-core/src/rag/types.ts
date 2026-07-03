/**
 * RAG types — placed in a leaf module so both mcp/ handlers and storage/ can
 * import them without pulling the whole rag pipeline.
 */

export interface SearchHit {
  /** Absolute or vault-relative path of the source file. */
  path: string
  /** Chunk index within that file (0-based). */
  chunkIdx: number
  /** The chunk text itself, ready to feed back into an agent. */
  text: string
  /** Cosine similarity in [0, 1]. Higher is better. */
  score: number
  /** Optional YAML frontmatter fields lifted from the note, for filtering. */
  meta?: Record<string, unknown>
}

export interface RagIndex {
  /** Model name used to embed everything in the index. Changing it means reindex. */
  embedModel: string
  /** Vector dim (must match embedModel). */
  dim: number
  /** Total chunks stored — for stats/health. */
  chunkCount: number
}
