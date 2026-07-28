import { describe, it, expect } from 'vitest';
import { TriageResultSchema, CATEGORIES, PRIORITIES } from '../src/llm/schemas.js';
import { MockProvider } from '../src/llm/mock.provider.js';

describe('TriageResultSchema', () => {
  it('accepts a valid triage object', () => {
    const r = TriageResultSchema.parse({ category: 'refund', priority: 'medium', escalate: false, reason: 'ok' });
    expect(r.category).toBe('refund');
  });

  it('rejects an out-of-enum category', () => {
    expect(() => TriageResultSchema.parse({ category: 'nonsense', priority: 'low', escalate: false, reason: 'x' })).toThrow();
  });

  it('rejects a non-boolean escalate', () => {
    expect(() =>
      TriageResultSchema.parse({ category: 'general', priority: 'low', escalate: 'yes', reason: 'x' }),
    ).toThrow();
  });
});

describe('MockProvider.triage returns valid enums for sample tickets', () => {
  const provider = new MockProvider();
  const samples = [
    { body: 'My headphones stopped working, they are defective and under warranty.', category: 'warranty' },
    { body: 'I want a refund for my order please.', category: 'refund' },
    { body: 'Where is my package? It shipped but has not arrived.', category: 'shipping' },
    { body: 'I was double charged on my statement for this billing.', category: 'billing' },
    { body: 'Someone hacked my account, please help, this is unauthorized.', category: 'account_security' },
    { body: 'What are your support hours?', category: 'general' },
  ];

  for (const s of samples) {
    it(`classifies "${s.body.slice(0, 30)}…" as ${s.category}`, async () => {
      const r = TriageResultSchema.parse(await provider.triage({ body: s.body }));
      expect(CATEGORIES).toContain(r.category);
      expect(PRIORITIES).toContain(r.priority);
      expect(r.category).toBe(s.category);
    });
  }

  it('escalates a clear account-compromise report', async () => {
    const r = await provider.triage({ body: 'My account was hacked and accessed without permission, urgent!' });
    expect(r.escalate).toBe(true);
    expect(r.priority).toBe('urgent');
  });
});
