import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { documents, drafts, tickets, type Draft } from '../db/schema.js';
import { getProvider, getRetriever } from '../container.js';
import { getTicketContext } from './context.js';
import { writeTrace } from './traces.js';
import { DraftLLMResultSchema } from '../llm/schemas.js';
import type { Category } from '../llm/schemas.js';
import { classifyCategory } from '../domain/classify.js';
import { scanText, guardrailResultString, type GuardrailFinding } from '../domain/guardrails.js';
import { windowForTicket } from '../domain/policy.js';
import type { WindowEvaluation } from '../domain/time.js';
import type { LLMProvider, RetrievedDoc, CustomerContext, OrderContext } from '../llm/provider.js';
import type { Retriever } from '../retrieval/retriever.js';
import { newId } from '../lib/ids.js';

const ACCOUNT_POLICY_DOC = 'KB-ACCOUNT-001';

/**
 * Query-expansion hints per category. Real ticket text often omits the policy
 * keyword ("my headphones are dead" never says "warranty"), so once triage has a
 * category we bias retrieval toward the matching policy family. 'general' is
 * intentionally empty so a genuinely unsupported question retrieves nothing.
 */
const CATEGORY_QUERY_HINT: Record<Category, string> = {
  warranty: 'warranty defect replacement',
  refund: 'refund return money back',
  shipping: 'shipping delivery tracking package',
  billing: 'billing charge payment',
  account_security: 'account security identity verification',
  general: '',
};

/** Categories whose resolution requires acting on a specific order. */
const ORDER_ACTION_CATEGORIES = new Set<Category>(['refund', 'warranty']);

function firstSentence(body: string): string {
  return (body.split('. ')[0] ?? body).trim();
}

/**
 * Grounded reply for a refund/warranty ticket with NO linked order. Explains the
 * policy (details are enough) but explicitly states that no order matched and asks
 * for one — it never implies the refund/replacement is available. The agency limit
 * forbids starting a refund/replacement without an order.
 */
function buildNeedOrderReply(category: Category, docs: RetrievedDoc[], name: string): string {
  const actionNoun = category === 'refund' ? 'a refund' : 'a replacement or warranty claim';
  const followUp = category === 'refund' ? 'the refund' : 'a replacement or claim';
  const lines = [
    `Hi ${name},`,
    '',
    `Here is what our ${category} policy covers:`,
    ...docs.map((d) => `• ${d.title}: ${firstSentence(d.body)}.`),
    '',
    `I wasn’t able to match this request to an order on the account, so I can’t start ${actionNoun} yet. ` +
      `Could you reply with the order number (or the email used at checkout) for the affected item? ` +
      `Once the order is confirmed, we can look into ${followUp}.`,
  ];
  return lines.join('\n');
}

export type DraftStatus = 'draft' | 'refused' | 'escalated';

export interface DraftPipelineInput {
  subject?: string | null;
  body: string;
  customer?: CustomerContext | null;
  order?: OrderContext | null;
  ticketCreatedAt: string;
  categoryHint?: Category | null;
  alreadySentCitations?: string[];
}

export interface DraftPipelineResult {
  status: DraftStatus;
  text: string;
  citations: string[];
  category: Category;
  guardrail: GuardrailFinding;
  retrievedDocIds: string[];
  adversarialRetrieved: string[];
  window: WindowEvaluation | null;
}

interface Deps {
  provider?: LLMProvider;
  retriever?: Retriever;
}

/**
 * Core RAG pipeline (Phase 5 + guardrails). No persistence — pure decision logic
 * so the eval runner and the API share exactly one code path.
 *
 * Order of enforcement:
 *   1. Guardrail gate on untrusted customer input.
 *   2. Retrieval (adversarial docs excluded from grounding).
 *   3. Time rule (pure helper, never the wall clock).
 *   4. Grounding gate: only assert policy that maps to a retrieved docId.
 */
export async function runDraftPipeline(
  input: DraftPipelineInput,
  deps: Deps = {},
): Promise<DraftPipelineResult> {
  const provider = deps.provider ?? getProvider();
  const retriever = deps.retriever ?? getRetriever();
  const db = getDb();

  const fullText = `${input.subject ?? ''}\n${input.body}`.trim();
  const guardrail = scanText(fullText);
  const category = input.categoryHint ?? classifyCategory(fullText);
  const window = windowForTicket(category, input.order?.orderDate, input.ticketCreatedAt);

  // Retrieval — bias toward the triaged policy family (see CATEGORY_QUERY_HINT).
  const query = `${fullText} ${CATEGORY_QUERY_HINT[category]}`.trim();
  const hits = retriever.search(query, 8);
  const retrievedDocIds = hits.map((h) => h.docId);
  const docRows =
    retrievedDocIds.length > 0
      ? db.select().from(documents).where(inArray(documents.docId, retrievedDocIds)).all()
      : [];
  const rowById = new Map(docRows.map((d) => [d.docId, d]));
  const adversarialRetrieved = retrievedDocIds.filter((id) => rowById.get(id)?.isAdversarial);

  // Non-adversarial hits, in score order.
  const cleanHits = hits.filter((h) => rowById.get(h.docId) && !rowById.get(h.docId)!.isAdversarial);
  // When we have a triaged category, only ground on docs from that policy family
  // (prevents citing shipping/account policy for a warranty issue). Fall back to
  // the top clean hits when no category is known yet.
  const inCategory = cleanHits.filter((h) => rowById.get(h.docId)!.category === category);
  const chosen = (input.categoryHint ? inCategory : cleanHits).slice(0, 4);
  const supporting: RetrievedDoc[] = chosen.map((h) => {
    const row = rowById.get(h.docId)!;
    return { docId: row.docId, title: row.title, body: row.body, score: h.score };
  });

  // ── 1. Guardrail gate ──────────────────────────────────────────────
  if (!guardrail.safe) {
    if (guardrail.matched.includes('identity_bypass')) {
      const hasAccountPolicy = Boolean(
        db.select().from(documents).where(eq(documents.docId, ACCOUNT_POLICY_DOC)).get(),
      );
      return {
        status: 'escalated',
        text:
          'For your account security I cannot skip identity verification or share account details until your identity is verified through our standard process. ' +
          'I have escalated this to our security team, who will reach out to verify you. (Ref: KB-ACCOUNT-001)',
        citations: hasAccountPolicy ? [ACCOUNT_POLICY_DOC] : [],
        category,
        guardrail,
        retrievedDocIds,
        adversarialRetrieved,
        window,
      };
    }
    // prompt_injection / secret_reveal
    return {
      status: 'refused',
      text:
        'I can’t help with that request. I won’t override my instructions, reveal internal prompts or secrets, ' +
        'or issue coupons/discounts outside an official promotion. If you have a genuine order, refund, or account question, I’m happy to help.',
      citations: [],
      category,
      guardrail,
      retrievedDocIds,
      adversarialRetrieved,
      window,
    };
  }

  // ── 2. Grounding gate: no supporting policy → escalate (never improvise) ──
  if (supporting.length === 0) {
    return {
      status: 'escalated',
      text:
        'I couldn’t find a supporting policy for this request in our knowledge base, so rather than guess I’ve routed it to a human agent who can help.',
      citations: [],
      category,
      guardrail,
      retrievedDocIds,
      adversarialRetrieved,
      window,
    };
  }

  // ── 2b. Agency limit: refund/warranty with NO linked order ──
  // We can explain the policy (details are enough), but we must NOT imply the
  // refund/replacement is available. State that no order matched and ask for it.
  // Applies regardless of phrasing ("Refund pls" is still an ask).
  if (!input.order && ORDER_ACTION_CATEGORIES.has(category)) {
    return {
      status: 'draft',
      text: buildNeedOrderReply(category, supporting, input.customer?.name ?? 'there'),
      citations: supporting.map((d) => d.docId),
      category,
      guardrail,
      retrievedDocIds,
      adversarialRetrieved,
      window,
    };
  }

  // ── 3. Generate the draft from grounded context ──
  let text: string;
  let claimedCitations: string[];
  let sufficient: boolean;
  try {
    const raw = await provider.draft({
      subject: input.subject,
      body: input.body,
      customer: input.customer ?? null,
      order: input.order ?? null,
      retrievedDocs: supporting,
      category,
      window,
      alreadySentCitations: input.alreadySentCitations,
    });
    const parsed = DraftLLMResultSchema.parse(raw);
    text = parsed.text;
    claimedCitations = parsed.citations;
    sufficient = parsed.sufficient;
  } catch {
    // Fail closed → escalate.
    return {
      status: 'escalated',
      text: 'I was unable to produce a reliable grounded reply, so I’ve escalated this to a human agent.',
      citations: [],
      category,
      guardrail,
      retrievedDocIds,
      adversarialRetrieved,
      window,
    };
  }

  // ── 4. Grounding gate: keep only citations that map to a retrieved, non-adversarial doc ──
  const supportingIds = new Set(supporting.map((d) => d.docId));
  const grounded = claimedCitations.filter((id) => supportingIds.has(id));

  if (grounded.length === 0) {
    return {
      status: 'escalated',
      text:
        'The retrieved policy doesn’t fully cover this request, so I’ve escalated it to a human agent rather than provide an unsupported answer.',
      citations: [],
      category,
      guardrail,
      retrievedDocIds,
      adversarialRetrieved,
      window,
    };
  }

  const finalStatus: DraftStatus = !sufficient ? 'escalated' : 'draft';

  return {
    status: finalStatus,
    text,
    citations: grounded,
    category,
    guardrail,
    retrievedDocIds,
    adversarialRetrieved,
    window,
  };
}

export interface DraftOutcome {
  draft: Draft;
  result: DraftPipelineResult;
}

/** DB-backed draft: run the pipeline for a ticket, persist the draft, write a trace. */
export async function runDraft(
  ticketId: string,
  opts: { agentId?: string | null } & Deps = {},
): Promise<DraftOutcome> {
  const ctx = getTicketContext(ticketId);
  if (!ctx) throw new Error(`Ticket not found: ${ticketId}`);
  const started = Date.now();
  const provider = opts.provider ?? getProvider();
  const db = getDb();

  // Fetch conversation history (sent agent replies and customer replies)
  const historyDrafts = db
    .select()
    .from(drafts)
    .where(and(eq(drafts.ticketId, ticketId), inArray(drafts.status, ['sent', 'customer_reply'])))
    .orderBy(asc(drafts.createdAt))
    .all();

  // Collect citations already sent in previous agent replies
  const sentDrafts = historyDrafts.filter((d) => d.status === 'sent');
  const alreadySentSet = new Set<string>();
  for (const d of sentDrafts) {
    if (Array.isArray(d.citations)) {
      d.citations.forEach((c) => alreadySentSet.add(c));
    }
    const matches = d.text.match(/KB-[A-Z0-9-]+/gi);
    if (matches) {
      matches.forEach((m) => alreadySentSet.add(m.toUpperCase()));
    }
  }
  const alreadySentCitations = Array.from(alreadySentSet);

  let fullBody = ctx.ticket.body;
  if (historyDrafts.length > 0) {
    const convoLines = historyDrafts.map((d) => {
      const sender = d.status === 'customer_reply' ? 'Customer' : 'Support Agent';
      return `[${sender}]: ${d.text}`;
    });
    fullBody = `${ctx.ticket.body}\n\n--- Conversation History ---\n${convoLines.join('\n\n')}`;
  }

  const result = await runDraftPipeline(
    {
      subject: ctx.ticket.subject,
      body: fullBody,
      customer: {
        id: ctx.customer.id,
        name: ctx.customer.name,
        emailVerified: ctx.customer.emailVerified,
        identityVerified: ctx.customer.identityVerified,
      },
      order: ctx.order
        ? {
            id: ctx.order.id,
            orderDate: ctx.order.orderDate,
            status: ctx.order.status,
            itemName: ctx.order.itemName,
            itemSku: ctx.order.itemSku,
            amountCents: ctx.order.amountCents,
            deliveredAt: ctx.order.deliveredAt,
          }
        : null,
      ticketCreatedAt: ctx.ticket.createdAt,
      categoryHint: (ctx.ticket.category as Category | null) ?? null,
      alreadySentCitations,
    },
    { provider, retriever: opts.retriever },
  );

  const now = new Date().toISOString();

  // Supersede any previous unsent 'draft' for this ticket so the new draft is active
  db.update(drafts)
    .set({ status: 'refused' })
    .where(and(eq(drafts.ticketId, ticketId), eq(drafts.status, 'draft')))
    .run();

  const draftRow: Draft = {
    id: newId(),
    ticketId,
    text: result.text,
    citations: result.citations,
    status: result.status,
    createdByAgentId: opts.agentId ?? null,
    editedByAgentId: null,
    editedAt: null,
    createdAt: now,
  };
  db.insert(drafts).values(draftRow).run();

  // Reflect escalation on the ticket.
  if (result.status === 'escalated') {
    db.update(tickets).set({ escalated: true, updatedAt: now }).where(eq(tickets.id, ticketId)).run();
  }

  writeTrace({
    ticketId,
    runType: 'draft',
    retrievedDocIds: result.retrievedDocIds,
    guardrailResult: guardrailResultString(result.guardrail),
    finalStatus: result.status,
    provider: provider.name,
    latencyMs: Date.now() - started,
    detail: {
      citations: result.citations,
      adversarialRetrieved: result.adversarialRetrieved,
      window: result.window,
      category: result.category,
    },
  });

  return { draft: draftRow, result };
}
