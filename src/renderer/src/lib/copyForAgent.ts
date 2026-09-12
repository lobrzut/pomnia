// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * What a skill or prompt turns into when it is going somewhere else.
 *
 * 0.1.83 made a row click copy the name, on the reasoning that "a prompt is
 * used by typing its name into a chat window". That holds only where the agent
 * already knows the name. Claude Code does not register Pomnia's prompts as
 * slash commands, so a pasted `/oszczedny-kod` comes back as
 * `Unknown command` — the reader is then worse off than before they clicked,
 * because the clipboard looks full.
 *
 * The list exists so a rule can leave the vault and land in a chat without
 * being retyped or explained. That means the text travels, not a reference to
 * it.
 */

/** Strip the `---` frontmatter block a vault file carries for the loader. */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return raw
  const nl = raw.indexOf('\n', end + 1)
  return nl === -1 ? '' : raw.slice(nl + 1)
}

/** A skill travels whole: it is already written to be read by an agent. */
export function skillForAgent(raw: string): string {
  return raw.trimEnd() + '\n'
}

/**
 * A prompt travels as its body with the argument slots taken out and one
 * labelled line left at the end.
 *
 * Leaving `{{zadanie}}` in place would mean editing the paste, which is the
 * work this button exists to remove. Dropping the slot silently would leave a
 * text that asks about a task it never names. So the slot is removed where it
 * sits and re-offered at the bottom, where typing one line finishes it.
 */
export function promptForAgent(raw: string, args: { name: string; required: boolean }[]): string {
  let body = stripFrontmatter(raw)
    .replace(/^[^\S\n]*\{\{\s*[\w-]+\s*\}\}[^\S\n]*$/gm, '') // slot alone on its line
    .replace(/\{\{\s*[\w-]+\s*\}\}/g, '') // slot inline in a sentence
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const slots = args.filter((a) => a.required)
  if (!slots.length) return body + '\n'

  const label = (n: string) => n.charAt(0).toUpperCase() + n.slice(1)
  body += '\n\n' + slots.map((a) => `${label(a.name)}: `).join('\n')
  return body + '\n'
}
