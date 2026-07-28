import type {
  LLMProvider,
  TriageInput,
  DraftInput,
  GuardrailInput,
} from './provider.js';
import type { TriageResult, DraftLLMResult, GuardrailResult } from './schemas.js';
import { keywordTriage } from '../domain/classify.js';
import { scanText, guardrailResultString } from '../domain/guardrails.js';

/**
 * Deterministic provider used by tests and (by default) the eval runner.
 * No network, no randomness — same input always yields the same output.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock' as const;

  async triage(input: TriageInput): Promise<TriageResult> {
    const text = `${input.subject ?? ''}\n${input.body}`;
    const { category, priority, escalate, finding } = keywordTriage(text);
    const reason = finding.safe
      ? `Classified as ${category} (priority ${priority}) from message keywords.`
      : `Adversarial pattern detected (${finding.kind}); routed as ${category} and escalated.`;
    return { category, priority, escalate, reason };
  }

  async draft(input: DraftInput): Promise<DraftLLMResult> {
    const docs = input.retrievedDocs;
    const citations = docs.map((d) => d.docId);

    if (docs.length === 0) {
      // No supporting policy retrieved → signal insufficiency; the grounding gate
      // (draft service) will convert this into a refusal/escalation.
      return {
        text: 'I could not find a supporting policy for this request, so I am not able to provide a grounded answer.',
        citations: [],
        sufficient: false,
      };
    }

    const parts: string[] = [];
    parts.push(`Hi ${input.customer?.name ?? 'there'},`);
    parts.push('');

    // Reflect the time-rule verdict deterministically when present.
    if (input.window) {
      if (input.window.within) {
        parts.push(
          `Your order (placed ${input.order?.orderDate?.slice(0, 10)}) is within the applicable ${input.window.windowDays}-day window (${input.window.elapsedDays} days elapsed), so it is eligible.`,
        );
      } else {
        parts.push(
          `Your order (placed ${input.order?.orderDate?.slice(0, 10)}) falls outside the ${input.window.windowDays}-day window (${input.window.elapsedDays} days elapsed), so it does not qualify under that policy; I can look into alternatives such as store credit.`,
        );
      }
      parts.push('');
    }

    parts.push(`Based on our policy (${citations.join(', ')}):`);
    for (const d of docs) {
      const firstSentence = d.body.split('. ')[0] ?? d.body;
      parts.push(`• ${d.title}: ${firstSentence}.`);
    }
    parts.push('');
    parts.push('If this looks right, an agent can proceed with the appropriate next step.');

    return {
      text: parts.join('\n'),
      citations,
      sufficient: true,
    };
  }

  async classifyGuardrail(input: GuardrailInput): Promise<GuardrailResult> {
    const finding = scanText(input.text);
    return {
      safe: finding.safe,
      kind: finding.kind,
      reason: finding.safe ? 'No adversarial pattern detected.' : guardrailResultString(finding),
    };
  }
}
