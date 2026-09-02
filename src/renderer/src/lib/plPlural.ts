// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Polish has three plural forms, and getting it wrong is the usual way
 * software written in English reads as foreign.
 *
 *   1            → połączenie   (one)
 *   2-4          → połączenia   (few)
 *   5+           → połączeń     (many)
 *
 * With one exception that catches everyone: the teens. 12, 13 and 14 end in
 * 2-4 and still take the "many" form, and then 22, 23, 24 go back to "few".
 *
 * Written once here because the second place that needed it — counting notes
 * staged for import — was about to copy the first, and a rule copied is a rule
 * that gets fixed in one place only.
 */

export function plForm(n: number, one: string, few: string, many: string): string {
  const last = n % 10
  const teen = n % 100
  if (n === 1) return one
  if (last >= 2 && last <= 4 && !(teen >= 12 && teen <= 14)) return few
  return many
}

/** The count and its form together, which is what a label almost always wants. */
export function plCount(n: number, one: string, few: string, many: string): string {
  return `${n} ${plForm(n, one, few, many)}`
}
