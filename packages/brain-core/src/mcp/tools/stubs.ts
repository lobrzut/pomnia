// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * MCP tools — MVP stubs.
 *
 * These tools existed in Python `dashboard/mcp_rag.py` and agents may still
 * call them (their tool catalog is cached client-side). Rather than remove
 * them from the schema (which would surprise callers with "unknown tool"),
 * we register them with the same input schema but return a "not implemented
 * in MVP" message. This lets us port the four load-bearing tools now and
 * revisit the rest when there's actual demand.
 *
 * Priority order for later ports (rough):
 *   - run_skill — depends on Ollama-backed workflow runner (later)
 *   - search_code / code_status — separate index (pipeline/codeindex.py in
 *     Python), niche
 *
 * list_skills / list_cli_skills / get_skill are implemented in skills.ts
 * (reads `<skillsRoot>/brain` + `cli`).
 */

export const stubSchemas = {
  list_skills: { type: 'object' as const, properties: {} },
  list_cli_skills: { type: 'object' as const, properties: {} },
  get_skill: {
    type: 'object' as const,
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  run_skill: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' },
      inputs: { type: 'object', default: {} },
    },
    required: ['name'],
  },
  search_code: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' },
      top_k: { type: 'integer', default: 5 },
    },
    required: ['query'],
  },
  code_status: { type: 'object' as const, properties: {} },
}

export function runStub(name: string): string {
  return (
    `Tool "${name}" is not implemented in brain-core MVP yet. ` +
    `See brain-in-node-rewrite-plan.md — this ships in a follow-up phase. ` +
    `For now, if this is a skill-related call, Pomnia syncs skills locally to ~/.pomnia/brain-skills/ ` +
    `and Claude Code can read them directly. If this is search_code, use the Python master.`
  )
}
