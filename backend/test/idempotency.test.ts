import { describe, it, expect, beforeAll } from 'vitest';
import { eq, like } from 'drizzle-orm';
import { initTestDb } from './helpers.js';
import { getDb } from '../src/db/client.js';
import { orders, toolCalls } from '../src/db/schema.js';
import { recommendAction, approveAction, rejectAction, ActionError } from '../src/services/actions.js';
import { seedId } from '../src/lib/ids.js';

/**
 * Approval-gated action idempotency (build-prompt §1.7 / Phase 6). Highest-value
 * safety behaviour alongside guardrails.
 */
describe('approval-gated actions', () => {
  beforeAll(() => initTestDb());
  const db = getDb();

  const countReplacements = () => db.select().from(orders).where(like(orders.id, 'ORD-REP-%')).all().length;

  it('recommend creates a pending row and does NOT execute', () => {
    const before = countReplacements();
    const tc = recommendAction({
      ticketId: seedId('TCK-9001'),
      toolName: 'create_replacement_order',
      args: { order_id: seedId('ORD-5001'), sku: 'AUD-WH-100', reason: 'defective left earcup' },
    });
    expect(tc.status).toBe('pending');
    expect(tc.idempotencyKey).toBeTruthy();
    expect(countReplacements()).toBe(before); // nothing executed yet
  });

  it('re-recommending with the same idempotency key does not duplicate the tool_call', () => {
    const key = 'fixed-key-123';
    const a = recommendAction({ ticketId: seedId('TCK-9001'), toolName: 'start_refund_review', args: { order_id: seedId('ORD-5001'), amount_cents: 100, reason: 'x' }, idempotencyKey: key });
    const b = recommendAction({ ticketId: seedId('TCK-9001'), toolName: 'start_refund_review', args: { order_id: seedId('ORD-5001'), amount_cents: 999, reason: 'y' }, idempotencyKey: key });
    expect(a.id).toBe(b.id);
    const rows = db.select().from(toolCalls).where(eq(toolCalls.idempotencyKey, key)).all();
    expect(rows).toHaveLength(1);
  });

  it('approving twice with the same key executes exactly once', () => {
    const tc = recommendAction({
      ticketId: seedId('TCK-9001'),
      toolName: 'create_replacement_order',
      args: { order_id: seedId('ORD-5001'), sku: 'AUD-WH-100', reason: 'defective' },
      idempotencyKey: 'replace-once-key',
    });
    const before = countReplacements();

    const first = approveAction({ toolCallId: tc.id, decidedBy: 'agent-1' });
    const second = approveAction({ toolCallId: tc.id, decidedBy: 'agent-1' });

    expect(first.status).toBe('executed');
    expect(second.status).toBe('executed');
    // Same replacement order id both times, and only ONE new order created.
    expect((first.result as { replacementOrderId: string }).replacementOrderId).toBe(
      (second.result as { replacementOrderId: string }).replacementOrderId,
    );
    expect(countReplacements()).toBe(before + 1);
  });

  it('rejecting prevents execution, and re-approving a rejected action is a conflict', () => {
    const tc = recommendAction({
      ticketId: seedId('TCK-9001'),
      toolName: 'create_replacement_order',
      args: { order_id: seedId('ORD-5001'), sku: 'AUD-WH-100', reason: 'defective' },
      idempotencyKey: 'reject-key',
    });
    const before = countReplacements();
    const rejected = rejectAction({ toolCallId: tc.id, decidedBy: 'agent-1', note: 'not eligible' });
    expect(rejected.status).toBe('rejected');
    expect(countReplacements()).toBe(before); // no effect

    expect(() => approveAction({ toolCallId: tc.id, decidedBy: 'agent-1' })).toThrowError(ActionError);
  });

  it('refuses to stage an order-based action on a ticket with no linked order', () => {
    // TCK-9008 (account compromise) has no linked order.
    expect(() =>
      recommendAction({
        ticketId: seedId('TCK-9008'),
        toolName: 'create_replacement_order',
        args: { sku: 'AUD-WH-100', reason: 'defective' },
      }),
    ).toThrowError(ActionError);
  });

  it('refuses an order_id that does not match the ticket’s linked order', () => {
    expect(() =>
      recommendAction({
        ticketId: seedId('TCK-9001'), // linked to ORD-5001
        toolName: 'start_refund_review',
        args: { order_id: 'ORD-9999', amount_cents: 100, reason: 'x' },
      }),
    ).toThrowError(ActionError);
  });

  it('an unapproved action never executes', () => {
    const before = countReplacements();
    recommendAction({
      ticketId: seedId('TCK-9001'),
      toolName: 'create_replacement_order',
      args: { order_id: seedId('ORD-5001'), sku: 'AUD-WH-100', reason: 'defective' },
      idempotencyKey: 'never-approved-key',
    });
    expect(countReplacements()).toBe(before);
  });
});
