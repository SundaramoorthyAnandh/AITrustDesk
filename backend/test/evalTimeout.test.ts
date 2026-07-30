import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initTestDb } from './helpers.js';
import { runEval } from '../src/eval/runner.js';
import type { LLMProvider } from '../src/llm/provider.js';

/**
 * The eval must never run forever, even if the LLM provider stalls. A per-case
 * timeout + bounded concurrency guarantee it always finishes; a stalled case
 * counts as a failure, never a silent pass.
 */
describe('eval is bounded and never hangs', () => {
  beforeAll(() => {
    initTestDb();
    process.env.EVAL_CASE_TIMEOUT_MS = '150';
    process.env.EVAL_CONCURRENCY = '8';
  });
  afterAll(() => {
    delete process.env.EVAL_CASE_TIMEOUT_MS;
    delete process.env.EVAL_CONCURRENCY;
  });

  it('finishes quickly and scores stalled cases as failures when the provider hangs', async () => {
    const hanging: LLMProvider = {
      name: 'langchain',
      triage: () => new Promise(() => {}), // never resolves
      draft: () => new Promise(() => {}),
      classifyGuardrail: () => new Promise(() => {}),
    };

    const start = Date.now();
    const summary = await runEval(hanging);
    const elapsed = Date.now() - start;

    expect(summary.totalCases).toBeGreaterThan(0);
    // Despite a provider that never responds, the whole run completes fast.
    expect(elapsed).toBeLessThan(5_000);
    // Timed-out cases are failures, not silent successes.
    expect(summary.metrics.triageAccuracy).toBe(0);
    expect(summary.cases.every((c) => c.draftStatus === 'timeout')).toBe(true);
  });
});
