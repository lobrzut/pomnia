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

/**
 * Refusal text for the unimplemented tools.
 *
 * The previous version told the caller to "use the Python master" — advice that
 * only ever made sense on the author's own network. Anyone who installs Pomnia
 * has no such host, so the product was pointing its users at a machine that
 * does not exist for them. Say what the tool does not do and what to do
 * instead, in terms that hold for every install.
 */
export function runStub(name: string): string {
  const alternative: Record<string, string> = {
    run_skill: 'Call get_skill to read the skill and carry out its steps yourself.',
    search_code:
      'Pomnia indexes distilled notes and library documents, not source trees. Search the repository with your own tools; use search_library for what was discussed about the code.',
    code_status: 'There is no code index in Pomnia. library_status reports the note and document index.',
  }
  return (
    `Tool "${name}" is not implemented — nothing ran and nothing was searched. ` +
    (alternative[name] ?? 'No equivalent is available.')
  )
}
