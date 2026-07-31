import { describe, it, expect, beforeAll } from 'vitest';
import { like } from 'drizzle-orm';
import { initTestDb } from './helpers.js';
import { getDb } from '../src/db/client.js';
import { orders } from '../src/db/schema.js';
import { recommendAction, approveAction, ActionError } from '../src/services/actions.js';
import { seedId } from '../src/lib/ids.js';

/**
 * An order can be refunded OR replaced — at most once, and never both. Distinct
 * from idempotency (same action re-run): this blocks a *different* action doing a
 * second remedy — a second refund, a second replacement, or the opposite remedy —
 * on the same order.
 */
describe('one remedy per order (refund XOR replacement)', () => {
  beforeAll(() => initTestDb());
  const db = getDb();

  it('refunds an order once, then blocks a second refund AND a replacement on that order', () => {
    const tid = seedId('TCK-9001'); // linked to ORD-5001 (AUD-WH-100, refundable)
    const oid = seedId('ORD-5001');

    const first = recommendAction({ ticketId: tid, toolName: 'start_refund_review', args: { order_id: oid, amount_cents: 500, reason: 'first' }, idempotencyKey: 'rr-first' });
    const secondRefund = recommendAction({ ticketId: tid, toolName: 'start_refund_review', args: { order_id: oid, amount_cents: 900, reason: 'second' }, idempotencyKey: 'rr-second' });
    const replacement = recommendAction({ ticketId: tid, toolName: 'create_replacement_order', args: { order_id: oid, sku: 'AUD-WH-100', reason: 'x' }, idempotencyKey: 'rep-x' });

    expect(approveAction({ toolCallId: first.id, decidedBy: 'agent-1' }).status).toBe('executed');
    // A different refund on the same order → conflict, not a 2nd refund.
    expect(() => approveAction({ toolCallId: secondRefund.id, decidedBy: 'agent-1' })).toThrowError(ActionError);
    // XOR: the opposite remedy (replacement) is also blocked once refunded.
    expect(() => approveAction({ toolCallId: replacement.id, decidedBy: 'agent-1' })).toThrowError(ActionError);
  });

  it('executes the first replacement on a fresh order but blocks a second, creating only one replacement order', () => {
    const tid = seedId('TCK-9005'); // linked to ORD-5005 (APP-WATCH-2), no prior remedy
    const oid = seedId('ORD-5005');

    const before = db.select().from(orders).where(like(orders.id, 'ORD-REP-%')).all().length;
    const a = recommendAction({ ticketId: tid, toolName: 'create_replacement_order', args: { order_id: oid, sku: 'APP-WATCH-2', reason: 'a' }, idempotencyKey: 'rep-a' });
    const b = recommendAction({ ticketId: tid, toolName: 'create_replacement_order', args: { order_id: oid, sku: 'APP-WATCH-2', reason: 'b' }, idempotencyKey: 'rep-b' });

    expect(approveAction({ toolCallId: a.id, decidedBy: 'agent-1' }).status).toBe('executed');
    expect(() => approveAction({ toolCallId: b.id, decidedBy: 'agent-1' })).toThrowError(ActionError);

    const after = db.select().from(orders).where(like(orders.id, 'ORD-REP-%')).all().length;
    expect(after).toBe(before + 1); // exactly one replacement created
  });
});
