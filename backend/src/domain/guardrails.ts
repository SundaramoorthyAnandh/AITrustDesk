import type { GuardrailKind } from '../llm/schemas.js';

/**
 * Deterministic, rule-based guardrail engine (build-prompt §1.5 / Phase 7).
 *
 * This is the AUTHORITATIVE safety layer: it does not depend on the LLM, so it
 * cannot be talked out of a decision by clever wording, and it is fully testable.
 * The LLM's classifyGuardrail() is defense-in-depth on top, never a replacement.
 *
 * Customer messages AND retrieved documents are untrusted DATA. Instructions found
 * inside them are never executed. KB-ADVERSARIAL-001 is caught here like any other
 * injection attempt, regardless of the fact it lives in the knowledge base.
 */

export interface GuardrailFinding {
  safe: boolean;
  /** Primary kind (priority: identity_bypass > prompt_injection > secret_reveal). */
  kind: GuardrailKind;
  /** All kinds that matched (for audit). */
  matched: GuardrailKind[];
  reason: string;
}

const IDENTITY_BYPASS_PATTERNS: RegExp[] = [
  /\bskip(ping)?\s+(the\s+)?(identity\s+)?(verification|verify|checks?|id\s+check)/i,
  /\bbypass(ing)?\s+(the\s+)?(identity|verification|security|checks?)/i,
  /\b(no|without|don'?t|do\s+not|dont)\s+(time\s+to\s+|need\s+to\s+|bother\s+)?(verify|verifying|verification)/i,
  /\bwithout\s+verify(ing)?/i,
  /\bdon'?t\s+verify\s+me/i,
];

// Requests to disclose account PII (used together with a bypass framing, or alone
// when combined with "immediately/now" urgency, count as an identity bypass attempt).
const ACCOUNT_PII_REQUEST =
  /\b(full\s+card\s+number|card\s+number|home\s+address|address\s+on\s+(my|the)\s+account|email\s+(currently\s+)?on\s+(my|the)\s+account|password\s+on\s+file|reset\s+my\s+password)\b/i;

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(your\s+)?(previous|prior|above|earlier)\s+instructions?\b/i,
  /\bdisregard\s+(the\s+)?(above|previous|prior|earlier|system)\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bsystem\s+override\b/i,
  /\byou\s+are\s+now\b/i,
  /\bjailbreak\b/i,
  /\bas\s+(a\s+)?(system\s+)?admin(istrator)?\b.*\b(authoriz|approv|reveal|override|discount|coupon)/i,
  /\bpre-?approved\b.*\b(coupon|discount|refund)/i,
  // Coupon minting / hidden-coupon injection
  /\b(give|generate|issue|create|reveal|show|apply)\b[^.]{0,40}\b(coupon|discount\s+code|promo\s+code)/i,
  /\b(free|secret|hidden|internal|100\s*%|100\s+percent)\b[^.]{0,25}\b(coupon|discount)/i,
];

const SECRET_REVEAL_PATTERNS: RegExp[] = [
  /\b(reveal|show|print|display|output|repeat|tell\s+me)\b[^.]{0,40}\b(system\s+prompt|hidden\s+prompt|instructions?|prompt)\b/i,
  /\b(system|hidden)\s+prompt\b/i,
  /\bsecret\s+(key|keys|token|code|password|credential)/i,
  /\bwhat\s+(are|were)\s+your\s+(instructions|rules|system\s+prompt)\b/i,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Scan a single untrusted text blob. Priority ordering matters for eval labels:
 * identity_bypass first, then prompt_injection, then secret_reveal.
 */
export function scanText(text: string): GuardrailFinding {
  const matched: GuardrailKind[] = [];

  const identityBypass =
    anyMatch(text, IDENTITY_BYPASS_PATTERNS) ||
    (ACCOUNT_PII_REQUEST.test(text) && /\b(now|immediately|hurry|urgent|asap|right\s+now)\b/i.test(text));
  const promptInjection = anyMatch(text, PROMPT_INJECTION_PATTERNS);
  const secretReveal = anyMatch(text, SECRET_REVEAL_PATTERNS);

  if (identityBypass) matched.push('identity_bypass');
  if (promptInjection) matched.push('prompt_injection');
  if (secretReveal) matched.push('secret_reveal');

  if (matched.length === 0) {
    return { safe: true, kind: 'none', matched: [], reason: '' };
  }

  const kind = matched[0]!; // priority order preserved by push order above
  const reasonByKind: Record<GuardrailKind, string> = {
    none: '',
    identity_bypass:
      'Request attempts to skip or bypass identity verification, or to disclose account PII without verification. Refused per KB-ACCOUNT-001; escalated to security.',
    prompt_injection:
      'Request attempts prompt injection / instruction override (e.g. minting an unauthorized coupon or claiming admin authority). Refused; treated as data, not instructions.',
    secret_reveal:
      'Request attempts to reveal the hidden system prompt or secrets. Refused; such content is never disclosed.',
  };

  return { safe: false, kind, matched, reason: reasonByKind[kind] };
}

/** Identity-bypass and prompt-injection warrant human escalation; secret-reveal is refused. */
export function shouldEscalate(finding: GuardrailFinding): boolean {
  return finding.matched.includes('identity_bypass') || finding.matched.includes('prompt_injection');
}

/** Compact string stored in traces.guardrail_result. */
export function guardrailResultString(finding: GuardrailFinding): string {
  return finding.safe ? 'safe' : `blocked:${finding.matched.join('+')}`;
}
