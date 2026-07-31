import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { initTestDb } from './helpers.js';
import { getDb } from '../src/db/client.js';
import { drafts, tickets } from '../src/db/schema.js';
import { recommendAction, approveAction, ActionError } from '../src/services/actions.js';
import { seedId } from '../src/lib/ids.js';

/**
 * Policy gate (KB-REFUND-002) + post-execute side effects.
 *  - A non-refundable item (gift card) can't have a refund review started.
 *  - A successful execute posts a plain, customer-facing note to the conversation
 *    (guardrailed — no internal ids) and auto-resolves the ticket.
 */
describe('refund policy gate + execute side effects', () => {
  beforeAll(() => initTestDb());
  const db = getDb();

  it('blocks starting a refund review for a non-refundable item', () => {
    // TCK-9011 → ORD-5008 → GFT-CARD-50 (gift card, refundable = false).
    const tid = seedId('TCK-9011');
    const oid = seedId('ORD-5008');
    expect(() =>
      recommendAction({
        ticketId: tid,
        toolName: 'start_refund_review',
        args: { order_id: oid, amount_cents: 5000, reason: 'customer wants money back' },
        idempotencyKey: 'gift-refund',
      }),
    ).toThrowError(ActionError);
  });

  it('allows a replacement for a non-refundable item (refund is the only blocked remedy)', () => {
    const tid = seedId('TCK-9011');
    const oid = seedId('ORD-5008');
    // Should NOT throw — replacement is unaffected by the refundable flag.
    const rec = recommendAction({
      ticketId: tid,
      toolName: 'create_replacement_order',
      args: { order_id: oid, sku: 'GFT-CARD-50', reason: 'replace gift card' },
      idempotencyKey: 'gift-replace',
    });
    expect(rec.status).toBe('pending');
  });

  it('posts a customer note (no internal ids) and resolves the ticket on execute', () => {
    // TCK-9002 → ORD-5002 (blender, refundable). Refund it.
    const tid = seedId('TCK-9002');
    const oid = seedId('ORD-5002');

    const rec = recommendAction({
      ticketId: tid,
      toolName: 'start_refund_review',
      args: { order_id: oid, amount_cents: 1999, reason: 'internal: defective per agent' },
      idempotencyKey: 'refund-note',
    });
    expect(approveAction({ toolCallId: rec.id, decidedBy: 'agent-1' }).status).toBe('executed');

    // A customer-facing note was posted to the conversation as 'sent'.
    const note = db
      .select()
      .from(drafts)
      .where(and(eq(drafts.ticketId, tid), eq(drafts.status, 'sent')))
      .all()
      .at(-1);
    expect(note).toBeTruthy();
    expect(note!.text.toLowerCase()).toContain('refund');
    // Guardrailed: never leak internal ids / raw reason / amounts into the note.
    expect(note!.text).not.toContain(oid);
    expect(note!.text).not.toContain('RRV-');
    expect(note!.text).not.toContain(rec.idempotencyKey);
    expect(note!.text.toLowerCase()).not.toContain('internal:');

    // The ticket was auto-resolved.
    const t = db.select().from(tickets).where(eq(tickets.id, tid)).get();
    expect(t!.status).toBe('resolved');
  });
});
