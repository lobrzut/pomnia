// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/**
 * Minimal conversation + distilled note shapes for server-side distill.
 * Kept local so brain-core does not import Desktop `src/core/model`.
 */

export type DistillRole = 'user' | 'assistant' | 'system' | 'tool'

export interface DistillMessage {
  role: DistillRole
  text: string
  ts?: string
}

export interface DistillConversation {
  id: string
  source: string
  title: string
  createdAt?: string
  updatedAt?: string
  messages: DistillMessage[]
}

export type DistillQuality = 'ok' | 'stub' | 'garbage'

export interface DistilledFields {
  summary: string
  decisions: string[]
  solutions: string[]
  facts: string[]
  openQuestions: string[]
}

export interface DistilledNote {
  title: string
  date: string
  source: string
  sessionId: string
  msgCount: number
  quality: DistillQuality
  score: number
  markdown: string
  fields: DistilledFields
}

export type QualityDestination = 'review' | 'weak' | 'keep'
