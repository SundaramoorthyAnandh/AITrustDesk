import { z } from 'zod';

/** Canonical enums — shared by triage, eval, and the frontends. */
export const CATEGORIES = [
  'shipping',
  'refund',
  'warranty',
  'billing',
  'account_security',
  'general',
] as const;
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const GUARDRAIL_KINDS = [
  'none',
  'identity_bypass',
  'prompt_injection',
  'secret_reveal',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];

/** Triage structured output. Every LLM triage parses through this. */
export const TriageResultSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  escalate: z.boolean(),
  reason: z.string().min(1).max(600),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

/**
 * Raw draft output from the model. `citations` are doc ids the model *claims* to
 * rely on; the grounding gate (domain/grounding.ts) is the authority that
 * validates them against what was actually retrieved before anything is trusted.
 */
export const DraftLLMResultSchema = z.object({
  text: z.string().min(1).max(4000),
  citations: z.array(z.string()).default([]),
  /** Model's self-assessment that retrieved policy fully supports the answer. */
  sufficient: z.boolean(),
});
export type DraftLLMResult = z.infer<typeof DraftLLMResultSchema>;

/** Guardrail classification of a single untrusted text blob. */
export const GuardrailResultSchema = z.object({
  safe: z.boolean(),
  kind: z.enum(GUARDRAIL_KINDS),
  reason: z.string().max(400).default(''),
});
export type GuardrailResult = z.infer<typeof GuardrailResultSchema>;
