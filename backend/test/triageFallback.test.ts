import { describe, it, expect, beforeAll } from 'vitest';
import { initTestDb } from './helpers.js';
import { runTriage } from '../src/services/triage.js';
import { classifyCategory } from '../src/domain/classify.js';
import { seedId } from '../src/lib/ids.js';
import type { LLMProvider } from '../src/llm/provider.js';

/**
 * Triage classification + fail-closed fallback. A charger‑defect complaint must
 * be a warranty (so the draft can ground on the warranty policy), and if the LLM
 * triage errors, we degrade to the deterministic keyword classifier — never a
 * blind "general" that would strand the ticket with no supporting policy.
 */
describe('triage classification & fail-closed fallback', () => {
  beforeAll(() => initTestDb());

  it('classifies a defect / overheating complaint as warranty', () => {
    expect(classifyCategory('Charger not working. It is heating up a lot and not turning on.')).toBe('warranty');
  });

  it('falls back to the keyword classifier (not blind "general") when LLM triage fails', async () => {
    const brokenProvider: LLMProvider = {
      name: 'langchain',
      triage: () => Promise.reject(new Error('LLM unavailable')),
      draft: () => Promise.reject(new Error('unused')),
      classifyGuardrail: () => Promise.reject(new Error('unused')),
    };
    // TCK-9001 "Left earcup of headphones is dead" → keyword category = warranty.
    const { triage } = await runTriage(seedId('TCK-9001'), brokenProvider);
    expect(triage.category).toBe('warranty'); // NOT 'general'
    expect(triage.escalate).toBe(true); // still flagged for human review
    expect(triage.reason).toMatch(/keyword/i);
  });
});
