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
    parts.push(customerClosing(input.category, input.window ?? null));

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

/** A warm, customer-facing closing tailored to the request — never agent-facing meta. */
function customerClosing(
  category: string | null | undefined,
  window: { within: boolean } | null,
): string {
  const outsideWindow = window ? !window.within : false;
  switch (category) {
    case 'refund':
      return outsideWindow
        ? 'While this falls outside the standard refund window, I’d be glad to look into store credit or other options — just let me know how you’d like to proceed.'
        : 'If you’d like to go ahead, I can start a refund review on this order for you. Just reply to confirm and I’ll take care of it.';
    case 'warranty':
      return 'If you’d like, I can arrange a replacement or repair under warranty. Let me know and I’ll get it started for you.';
    case 'shipping':
      return 'Please allow the timeframe noted above; if it still hasn’t arrived, reply here and I’ll open a claim right away.';
    case 'billing':
      return 'I’ll review the charge and make sure everything is correct — please let me know if anything still looks off.';
    default:
      return 'Please let me know if there’s anything else I can help with — I’m happy to assist.';
  }
}
