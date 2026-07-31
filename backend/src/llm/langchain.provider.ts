import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import type {
  LLMProvider,
  TriageInput,
  DraftInput,
  GuardrailInput,
} from './provider.js';
import {
  TriageResultSchema,
  DraftLLMResultSchema,
  GuardrailResultSchema,
  type TriageResult,
  type DraftLLMResult,
  type GuardrailResult,
} from './schemas.js';
import {
  buildTriagePrompt,
  buildDraftPrompt,
  buildGuardrailPrompt,
  GUARDRAIL_SYSTEM,
} from './prompts.js';
import { scanText } from '../domain/guardrails.js';
import { env } from '../config/env.js';

/**
 * Real provider: LangChain.js ChatOpenAI → LM Studio (OpenAI-compatible).
 *
 * Structured outputs are validated through Zod. On parse failure we retry ONCE
 * with a corrective instruction, then FAIL CLOSED — the service treats a thrown
 * error as "escalate", never as a silent success (build-prompt §1 / §1.6).
 */
export class LangChainProvider implements LLMProvider {
  readonly name = 'langchain' as const;
  /** Draft generation — uses the configured temperature (some creative latitude). */
  private readonly model: ChatOpenAI;
  /**
   * Classification (triage + guardrail) — temperature 0 so the same ticket always
   * classifies the same way. Draft phrasing can vary; a category/verdict must not.
   * This is what keeps triage & guardrails consistent run-to-run.
   */
  private readonly classifier: ChatOpenAI;

  constructor() {
    const common = {
      model: env.MODEL_NAME,
      apiKey: env.OPENAI_API_KEY,
      timeout: env.LLM_TIMEOUT_MS,
      maxRetries: 0, // we own the retry policy
      configuration: { baseURL: env.OPENAI_BASE_URL },
    };
    this.model = new ChatOpenAI({ ...common, temperature: env.LLM_TEMPERATURE });
    this.classifier = new ChatOpenAI({ ...common, temperature: 0 });
  }

  private async callJson<S extends z.ZodTypeAny>(
    system: string,
    user: string,
    schema: S,
    model: ChatOpenAI = this.model,
  ): Promise<z.infer<S>> {
    const attempt = async (extra?: string): Promise<z.infer<S>> => {
      const res = await model.invoke([
        { role: 'system', content: system },
        { role: 'user', content: extra ? `${user}\n\n${extra}` : user },
      ]);
      const raw = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
      const json = extractJson(raw);
      return schema.parse(json);
    };

    try {
      return await attempt();
    } catch {
      // One corrective retry, then fail closed.
      return await attempt('Your previous response was invalid. Respond with ONLY valid JSON matching the schema.');
    }
  }

  async triage(input: TriageInput): Promise<TriageResult> {
    const { system, user } = buildTriagePrompt(input);
    return this.callJson(system, user, TriageResultSchema, this.classifier);
  }

  async draft(input: DraftInput): Promise<DraftLLMResult> {
    const { system, user } = buildDraftPrompt(input);
    return this.callJson(system, user, DraftLLMResultSchema);
  }

  async classifyGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
    // Deterministic scan is authoritative for positives; the LLM is a secondary
    // check only when the deterministic layer sees nothing. Any LLM failure
    // degrades to the (safe) deterministic verdict — never crashes the request.
    const deterministic = scanText(input.text);
    if (!deterministic.safe) {
      return { safe: false, kind: deterministic.kind, reason: deterministic.reason };
    }
    try {
      return await this.callJson(GUARDRAIL_SYSTEM, buildGuardrailPrompt(input.text), GuardrailResultSchema, this.classifier);
    } catch {
      return { safe: true, kind: 'none', reason: 'LLM guardrail unavailable; deterministic scan clean.' };
    }
  }
}

/** Best-effort extraction of a JSON object from a model response. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
