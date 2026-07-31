import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { tickets, type Ticket } from '../db/schema.js';
import { getProvider } from '../container.js';
import { getTicketContext } from './context.js';
import { writeTrace } from './traces.js';
import { TriageResultSchema, type TriageResult } from '../llm/schemas.js';
import { scanText, guardrailResultString } from '../domain/guardrails.js';
import { keywordTriage } from '../domain/classify.js';
import type { LLMProvider } from '../llm/provider.js';

export interface TriageOutcome {
  ticket: Ticket;
  triage: TriageResult;
}

/**
 * Run triage for a ticket, persist the classification, and write one trace.
 * Fails closed: if the provider's output can't be validated, we escalate.
 */
export async function runTriage(
  ticketId: string,
  provider: LLMProvider = getProvider(),
): Promise<TriageOutcome> {
  const ctx = getTicketContext(ticketId);
  if (!ctx) throw new Error(`Ticket not found: ${ticketId}`);
  const started = Date.now();

  const guardrail = scanText(`${ctx.ticket.subject ?? ''}\n${ctx.ticket.body}`);

  let triage: TriageResult;
  try {
    const raw = await provider.triage({
      subject: ctx.ticket.subject,
      body: ctx.ticket.body,
      order: ctx.order
        ? {
            id: ctx.order.id,
            purchaseDate: ctx.order.purchaseDate,
            registeredAt: ctx.order.registeredAt,
            status: ctx.order.status,
            itemName: ctx.order.itemName,
            itemSku: ctx.order.itemSku,
            amountCents: ctx.order.amountCents,
            deliveredAt: ctx.order.deliveredAt,
          }
        : null,
      customer: {
        id: ctx.customer.id,
        name: ctx.customer.name,
        emailVerified: ctx.customer.emailVerified,
        identityVerified: ctx.customer.identityVerified,
      },
    });
    triage = TriageResultSchema.parse(raw);
  } catch {
    // Fail closed, but degrade gracefully: fall back to the deterministic keyword
    // classifier (the same logic the mock uses) instead of a blind 'general'. This
    // keeps the category sensible when the LLM errors or returns invalid JSON — a
    // defect complaint stays 'warranty' so the draft can still ground + cite — and
    // we still flag for human review since the model path failed.
    const kw = keywordTriage(`${ctx.ticket.subject ?? ''}\n${ctx.ticket.body}`);
    triage = {
      category: kw.category,
      priority: kw.priority,
      escalate: true,
      reason: 'Triage model unavailable — used keyword classifier; flagged for review.',
    };
  }

  // Guardrail signals always force escalation.
  if (!guardrail.safe && (guardrail.matched.includes('identity_bypass') || guardrail.matched.includes('prompt_injection'))) {
    triage.escalate = true;
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.update(tickets)
    .set({
      category: triage.category,
      priority: triage.priority,
      escalated: triage.escalate,
      status: 'triaged',
      updatedAt: now,
    })
    .where(eq(tickets.id, ticketId))
    .run();

  writeTrace({
    ticketId,
    runType: 'triage',
    guardrailResult: guardrailResultString(guardrail),
    finalStatus: triage.escalate ? 'escalated' : 'ok',
    provider: provider.name,
    latencyMs: Date.now() - started,
    detail: { triage },
  });

  const updated = db.select().from(tickets).where(eq(tickets.id, ticketId)).get()!;
  return { ticket: updated, triage };
}
