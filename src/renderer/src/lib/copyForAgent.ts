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

/**
 * Same shape the server's prompt parser accepts, deliberately.
 *
 * `packages/brain-core/src/mcp/prompts.ts` matches
 * `/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g` — ASCII only. Widening it here would make
 * this function strip text the server treats as ordinary prose, and the paste
 * would quietly lose a sentence.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g

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
 * Take the slots out of one line, keeping the line readable.
 *
 * A slot with nothing after it on its line is cut: `Steps: {{repro}}` becomes
 * `Steps:`, and a slot alone on its own line becomes a blank one that the
 * blank-line collapse then swallows. Nothing is lost, because nothing followed.
 *
 * A slot with prose after it keeps its name. `Przetlumacz {{tekst}} na
 * angielski` must not become `Przetlumacz  na angielski` — a sentence with a
 * hole in it reads as a bug in Pomnia, not as a slot to fill. Single braces,
 * so it can never be mistaken for a placeholder the server would expand.
 */
function cutSlots(line: string): string {
  const re = new RegExp(PLACEHOLDER.source, 'g')
  let out = ''
  let last = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    const trailing = line.slice(m.index + m[0].length)
    out += line.slice(last, m.index) + (trailing.trim() === '' ? '' : `{${m[1]}}`)
    last = m.index + m[0].length
  }
  return (out + line.slice(last)).trimEnd()
}

/**
 * A prompt travels as its body with the argument slots taken out and one
 * labelled line per slot left at the end.
 *
 * Leaving `{{zadanie}}` in place would mean editing the paste, which is the
 * work this button exists to remove. Dropping the slot silently would leave a
 * text that asks about a task it never names. So the slots come out of the body
 * and are re-offered at the bottom, where typing one line finishes it — at the
 * bottom specifically, because typing at the end of a paste is one keystroke
 * and typing into the middle of one, in a terminal input, is not.
 *
 * The labels come from what was actually cut out of the body, not from the
 * declared `arguments:` list. Those two disagree more often than they look:
 * the server marks a placeholder it inferred from the body as required, but an
 * argument written out in frontmatter without `required: true` defaults to
 * false. Trusting the declaration meant an optional slot was stripped and never
 * re-offered — producing exactly the nameless prompt this function exists to
 * avoid. The body is the honest source: if a slot was cut from it, it needs a
 * line back.
 */
export function promptForAgent(raw: string, _args?: { name: string; required: boolean }[]): string {
  const body = stripFrontmatter(raw)

  const seen: string[] = []
  for (const m of body.matchAll(PLACEHOLDER)) {
    if (!seen.includes(m[1])) seen.push(m[1])
  }

  const cleaned = body
    .split('\n')
    .map(cutSlots)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!seen.length) return cleaned + '\n'

  const label = (n: string) => n.charAt(0).toUpperCase() + n.slice(1)
  return cleaned + '\n\n' + seen.map((n) => `${label(n)}: `).join('\n') + '\n'
}
