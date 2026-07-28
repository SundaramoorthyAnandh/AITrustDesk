import type { Category, Priority } from '../llm/schemas.js';
import { scanText, shouldEscalate, type GuardrailFinding } from './guardrails.js';

/**
 * Deterministic keyword triage used by the MockProvider (and mirrored by the eval
 * fixtures). Category precedence is fixed so results are reproducible.
 * The real LangChainProvider delegates this judgement to the model instead.
 */

const ACCOUNT_RE =
  /\b(account|password|log(ged)?\s*in|login|hacked|unauthori[sz]ed|identity|verify\s+me|2fa|two-?factor|card\s+number|home\s+address|email\s+(currently\s+)?on\s+(my|the)\s+account)\b/i;
const WARRANTY_RE =
  /\b(warranty|defect(ive)?|stopped\s+working|not\s+working|flicker|broken|damaged|dead|goes?\s+black|malfunction|faulty|cover(ed|age)?)\b/i;
const REFUND_RE = /\b(refund|money\s+back|return\s+.*(refund|money)|want\s+to\s+return|reimburse)\b/i;
const SHIPPING_RE =
  /\b(shipp(ed|ing)|deliver(y|ed)?|arriv(e|ed|al)|tracking|where\s+is|package|parcel|lost|in\s+transit)\b/i;
const BILLING_RE =
  /\b(charge(d|s)?|billing|invoice|statement|payment|coupon|discount|promo|refunded\s+to)\b/i;

const COMPROMISE_RE = /\b(hack(ed)?|unauthori[sz]ed|compromis|someone\s+(logged|accessed)|fraud|stolen)\b/i;
const DUPLICATE_CHARGE_RE = /\b(double|duplicate|twice|two\s+charges)\b/i;
const SHIPPING_URGENT_RE = /\b(lost|stuck|not\s+updated|hasn'?t\s+updated|missing|never\s+arrived)\b/i;

export function classifyCategory(text: string): Category {
  if (ACCOUNT_RE.test(text)) return 'account_security';
  if (WARRANTY_RE.test(text)) return 'warranty';
  if (REFUND_RE.test(text)) return 'refund';
  if (SHIPPING_RE.test(text)) return 'shipping';
  if (BILLING_RE.test(text)) return 'billing';
  return 'general';
}

export function classifyPriority(text: string, category: Category, finding: GuardrailFinding): Priority {
  if (finding.matched.includes('identity_bypass')) return 'urgent';
  if (category === 'account_security' && COMPROMISE_RE.test(text)) return 'urgent';
  if (category === 'warranty') return 'high';
  if (category === 'billing' && DUPLICATE_CHARGE_RE.test(text)) return 'high';
  if (category === 'shipping' && SHIPPING_URGENT_RE.test(text)) return 'high';
  if (category === 'account_security') return 'high';
  if (category === 'refund') return 'medium';
  if (category === 'billing') return 'medium';
  if (category === 'shipping') return 'medium';
  return 'low';
}

export function classifyEscalate(text: string, category: Category, finding: GuardrailFinding): boolean {
  if (shouldEscalate(finding)) return true;
  if (category === 'account_security' && COMPROMISE_RE.test(text)) return true;
  return false;
}

export interface KeywordTriage {
  category: Category;
  priority: Priority;
  escalate: boolean;
  finding: GuardrailFinding;
}

export function keywordTriage(text: string): KeywordTriage {
  const finding = scanText(text);
  const category = classifyCategory(text);
  const priority = classifyPriority(text, category, finding);
  const escalate = classifyEscalate(text, category, finding);
  return { category, priority, escalate, finding };
}

/**
 * Does the message ask us to DO something (start a refund / replacement / return /
 * warranty claim) versus merely ask ABOUT policy ("how long is the warranty?",
 * "what's your refund policy?")? Used to enforce the agency limit: an actionable
 * refund/replacement request needs an order, but a policy question does not.
 * Deliberately conservative so "refund policy" is NOT treated as an action.
 */
const ACTION_INTENT_PATTERNS: RegExp[] = [
  /\b(want|would\s+like|need|get|getting|start|give|issue|process|request|file|make|initiate)\b[^.?!]{0,40}\b(refund|replacement|replace|return|exchange|reimburse|money\s+back|new\s+one|new\s+unit)\b/i,
  /\bwant\s+(a\s+)?(refund|replacement|new)\b/i,
  /\brefund\s+(me|my|it|this|the\s+order|please)\b/i,
  /\breplace\s+(it|this|my|the)\b/i,
  /\bsend\s+(me\s+)?(a\s+)?(new|replacement)\b/i,
  /\breturn\s+(it|this|my)\b/i,
  /\bmoney\s+back\b/i,
  /\b(swap|exchange)\s+(it|this|my)\b/i,
  /\b(file|make|submit|open)\s+(a\s+)?(warranty\s+)?claim\b/i,
];

export function isActionRequest(text: string): boolean {
  return ACTION_INTENT_PATTERNS.some((re) => re.test(text));
}
