import type {
  TriageResult,
  DraftLLMResult,
  GuardrailResult,
} from './schemas.js';

/** A retrieved KB doc as presented to the model (untrusted content). */
export interface RetrievedDoc {
  docId: string;
  title: string;
  body: string;
  score?: number;
}

export interface OrderContext {
  id: string;
  orderDate: string;
  status: string;
  itemName?: string | null;
  itemSku?: string | null;
  amountCents?: number;
  deliveredAt?: string | null;
}

export interface CustomerContext {
  id: string;
  name: string;
  emailVerified: boolean;
  identityVerified: boolean;
}

export interface TriageInput {
  subject?: string | null;
  body: string;
  order?: OrderContext | null;
  customer?: CustomerContext | null;
}

export interface DraftInput {
  subject?: string | null;
  body: string;
  customer?: CustomerContext | null;
  order?: OrderContext | null;
  retrievedDocs: RetrievedDoc[];
  /** Pre-computed window verdict from the pure time helper (never Date.now()). */
  window?: { windowDays: number; elapsedDays: number; within: boolean } | null;
}

export interface GuardrailInput {
  text: string;
  source: 'customer' | 'document';
}

/**
 * Adapter boundary (build-prompt §1.1). Everything downstream depends ONLY on this
 * interface — never on LangChain directly. Two implementations ship:
 *   - LangChainProvider (real, LM Studio)
 *   - MockProvider (deterministic fixtures; used by tests + default eval)
 */
export interface LLMProvider {
  readonly name: 'mock' | 'langchain';
  triage(input: TriageInput): Promise<TriageResult>;
  draft(input: DraftInput): Promise<DraftLLMResult>;
  classifyGuardrail(input: GuardrailInput): Promise<GuardrailResult>;
}
