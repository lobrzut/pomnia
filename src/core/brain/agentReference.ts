// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * A reference to skills and prompts, for an agent that has Pomnia connected.
 *
 * Copying a skill's text into a chat works everywhere, but it freezes a
 * snapshot, and mixing three of them means pasting three documents. An agent
 * with Pomnia's MCP server already has `get_skill` and `get_prompt`, so a line
 * naming what to load is enough: it resolves to the current version, and
 * `get_prompt` fills the arguments on the server. Measured against the live
 * server on 2026-09-13 — `get_prompt("oszczedny-kod", { zadanie })` came back
 * with the value in place and `missing: []`.
 *
 * It does not save tokens. The text still enters the agent's context, as a
 * tool result instead of a paste. What it saves is the paste.
 *
 * The line is fixed and never translated. `snippet.ts` teaches agents to
 * recognise it, and a prefix that changed with the UI language would be a
 * second convention to teach.
 */

export const REFERENCE_PREFIX = 'Pomnia MCP:'

export interface SkillToName {
  /** `own` and `brain` are the same thing, seen from the desktop and from the server. */
  kind: 'own' | 'brain' | 'imported' | 'cli'
  name: string
  category?: string
}

/**
 * The name `get_skill` resolves to exactly this skill, or null when no name
 * reaches it on the server as deployed.
 *
 * Mirrors the parts of `findSkill` (packages/brain-core/src/mcp/tools/skills.ts)
 * that decide which file answers:
 *
 * - a bare name tries `brain/<name>.md` first, by exact file name;
 * - `category/name` searches that cli category and never looks in `brain/`;
 * - one category cannot hold two packages with the same name.
 *
 * So an own skill is its bare name and a categorised package is
 * `category/name`, with no catalogue needed — which matters, because Mini never
 * holds the catalogue; it loads one category at a time. What is left is an
 * uncategorised package sharing its name with an own skill. The bare name loads
 * the own skill instead, silently, and no other name reaches the package. This
 * returns null for it, and the caller copies the text rather than a reference
 * that would load the wrong skill.
 */
export function skillCallName(skill: SkillToName, ownNames: readonly string[]): string | null {
  if (skill.kind === 'own' || skill.kind === 'brain') return skill.name
  if (skill.category) return `${skill.category}/${skill.name}`
  return ownNames.includes(skill.name) ? null : skill.name
}

export interface PromptToName {
  name: string
  arguments: readonly { name: string; required: boolean }[]
}

/**
 * One line naming everything to load, then one line per argument to fill.
 *
 *     Pomnia MCP: get_skill build-our-way, security/nmap-recon; get_prompt oszczedny-kod
 *     zadanie:
 *
 * Arguments come last for the reason the text copy puts them last: typing at
 * the end of a paste is one keystroke, typing into the middle of one in a
 * terminal input is not. An optional argument gets a line too — leaving it
 * empty is a choice, and a missing line is not.
 *
 * When two picked prompts both take `temat`, each line says whose it is.
 * "temat:" twice would leave the agent guessing which value goes where.
 */
export function referenceForAgent(pick: {
  skills: readonly string[]
  prompts: readonly PromptToName[]
}): string {
  const groups: string[] = []
  if (pick.skills.length) groups.push(`get_skill ${pick.skills.join(', ')}`)
  if (pick.prompts.length) groups.push(`get_prompt ${pick.prompts.map((p) => p.name).join(', ')}`)
  if (!groups.length) return ''

  const uses = new Map<string, number>()
  for (const p of pick.prompts) {
    for (const a of p.arguments) uses.set(a.name, (uses.get(a.name) ?? 0) + 1)
  }
  const slots: string[] = []
  for (const p of pick.prompts) {
    for (const a of p.arguments) {
      slots.push((uses.get(a.name) ?? 0) > 1 ? `${a.name} (${p.name}): ` : `${a.name}: `)
    }
  }

  return [`${REFERENCE_PREFIX} ${groups.join('; ')}`, ...slots].join('\n') + '\n'
}
