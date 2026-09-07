// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * The prompt library, reachable by an agent as well as by a person.
 *
 * MCP already serves these over `prompts/list` and `prompts/get`, and that is
 * the right door for "I pick a prompt in my client". It is the only door the
 * protocol gives, though, and an agent cannot open it — `prompts/get` is a
 * client call, not a tool. So "use the bug-report prompt" was a sentence the
 * user could say and nothing could act on.
 *
 * These two tools are the second door onto the same files. Exactly the pairing
 * skills already have: `list_skills` to see what exists, `get_skill` to load
 * one. Nothing is duplicated except the entry point.
 *
 * Arguments are optional here, deliberately. `prompts/get` refuses to render
 * without the required ones, which is right when a person is filling in a form
 * and wrong for an agent that is holding the conversation the values are in:
 * refusing would just make it guess. Unfilled placeholders come back visible,
 * with the signature beside them, so the agent can see what is missing and ask.
 */
import { loadPrompts, renderPrompt } from '../prompts.js'

export const listPromptsSchema = { type: 'object' as const, properties: {} }

export const getPromptSchema = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const, description: 'Prompt name, as listed by list_prompts.' },
    arguments: {
      type: 'object' as const,
      description: 'Values for the prompt placeholders. Anything omitted is left visible in the text.',
    },
  },
  required: ['name'] as string[],
}

export interface PromptToolDeps {
  vaultRoot: string
}

export function runListPrompts(_args: unknown, deps: PromptToolDeps): string {
  const prompts = loadPrompts(deps.vaultRoot)
  if (prompts.length === 0) {
    return JSON.stringify({
      prompts: [],
      hint: 'no prompts yet — they live in vault/prompts/*.md',
    })
  }
  return JSON.stringify(
    {
      prompts: prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      })),
    },
    null,
    2,
  )
}

export function runGetPrompt(args: unknown, deps: PromptToolDeps): string {
  const name =
    args && typeof args === 'object' && 'name' in args
      ? String((args as { name: unknown }).name).trim()
      : ''
  if (!name) throw new Error('get_prompt requires name')

  const def = loadPrompts(deps.vaultRoot).find((p) => p.name === name)
  if (!def) {
    return JSON.stringify({
      error: `prompt not found: ${name}`,
      hint: 'discover names with list_prompts',
    })
  }

  const raw =
    args && typeof args === 'object' && 'arguments' in args
      ? (args as { arguments?: unknown }).arguments
      : undefined
  const values = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  // Render without enforcing required arguments, then say which are still
  // missing. An agent that is told what is missing can ask; an agent that is
  // handed an error can only guess.
  const missing = def.arguments
    .filter((a) => a.required)
    .filter((a) => {
      const v = values[a.name]
      return v === undefined || v === null || String(v).trim() === ''
    })
    .map((a) => a.name)

  const text = renderPrompt({ ...def, arguments: def.arguments.map((a) => ({ ...a, required: false })) }, values)

  return JSON.stringify(
    {
      name: def.name,
      description: def.description,
      arguments: def.arguments.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
      missing,
      text,
    },
    null,
    2,
  )
}
