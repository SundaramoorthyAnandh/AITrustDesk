import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { toolCalls, approvals, orders, tickets, type ToolCall } from '../db/schema.js';
import { newId, sha256 } from '../lib/ids.js';
import { writeTrace } from './traces.js';

export type ToolName = 'start_refund_review' | 'create_replacement_order';

/** Tools that can only act on a specific order (the agency limit). */
const ORDER_REQUIRED_TOOLS = new Set<ToolName>(['start_refund_review', 'create_replacement_order']);

export class ActionError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'conflict' | 'bad_request' | 'failed',
  ) {
    super(message);
  }
}

/**
 * AI recommends an action → a pending tool_calls row with an idempotency_key.
 * Nothing executes here (build-prompt §1.7 / Phase 6). If a caller re-submits the
 * SAME idempotency_key, we return the existing row instead of inserting a duplicate.
 */
export function recommendAction(params: {
  ticketId: string;
  toolName: ToolName;
  args: Record<string, unknown>;
  idempotencyKey?: string;
  agentId?: string | null;
}): ToolCall {
  const db = getDb();
  const now = new Date().toISOString();
  const idempotencyKey = params.idempotencyKey ?? newId();

  // Agency limit: an order-based action requires a ticket with a linked order,
  // and the target order must match that ticket's order. Without an order to act
  // on, we refuse to even stage the action (defence in depth over the UI guard).
  const ticket = db.select().from(tickets).where(eq(tickets.id, params.ticketId)).get();
  if (!ticket) throw new ActionError(`Ticket not found: ${params.ticketId}`, 'not_found');
  if (ORDER_REQUIRED_TOOLS.has(params.toolName)) {
    if (!ticket.orderId) {
      throw new ActionError(
        `${params.toolName} requires an order, but ticket ${params.ticketId} has no linked order.`,
        'bad_request',
      );
    }
    const targetOrderId = String(params.args.order_id ?? '');
    if (targetOrderId && targetOrderId !== ticket.orderId) {
      throw new ActionError(
        `order_id must match the ticket's linked order (${ticket.orderId}).`,
        'bad_request',
      );
    }
    // Normalise to the ticket's order so a missing/blank order_id can't slip through.
    params.args = { ...params.args, order_id: ticket.orderId };
  }

  const existing = db
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.idempotencyKey, idempotencyKey))
    .get();
  if (existing) return existing;

  const row: ToolCall = {
    id: newId(),
    ticketId: params.ticketId,
    toolName: params.toolName,
    args: params.args,
    idempotencyKey,
    status: 'pending',
    result: null,
    recommendedByAgentId: params.agentId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  // onConflictDoNothing guards against a concurrent insert with the same key.
  db.insert(toolCalls).values(row).onConflictDoNothing().run();
  return db.select().from(toolCalls).where(eq(toolCalls.idempotencyKey, idempotencyKey)).get() ?? row;
}

/**
 * Approve and execute. Idempotent by construction:
 *  - The whole approve+execute runs in a synchronous SQLite transaction.
 *  - If the row is already 'executed', we return the stored result WITHOUT
 *    re-running the effect (so approving twice executes exactly once).
 *  - The concrete effect is itself keyed by the idempotency_key, so even a
 *    duplicated effect insert is a no-op.
 */
export function approveAction(params: {
  toolCallId: string;
  decidedBy: string;
  note?: string;
}): ToolCall {
  const db = getDb();

  return db.transaction((tx) => {
    const tc = tx.select().from(toolCalls).where(eq(toolCalls.id, params.toolCallId)).get();
    if (!tc) throw new ActionError('Tool call not found', 'not_found');
    if (tc.status === 'rejected') throw new ActionError('Action was already rejected', 'conflict');

    // Already executed → return cached result, no duplicate effect, no new approval row.
    if (tc.status === 'executed') return tc;

    const now = new Date().toISOString();
    tx.insert(approvals)
      .values({
        id: newId(),
        toolCallId: tc.id,
        decision: 'approved',
        decidedBy: params.decidedBy,
        decidedAt: now,
        note: params.note ?? null,
      })
      .run();

    let result: Record<string, unknown>;
    let status: ToolCall['status'] = 'executed';
    try {
      result = executeEffect(tx, tc);
    } catch (err) {
      status = 'failed';
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    tx.update(toolCalls)
      .set({ status, result, updatedAt: now })
      .where(eq(toolCalls.id, tc.id))
      .run();

    writeTrace({
      ticketId: tc.ticketId,
      runType: 'triage', // action executions are audited under the ticket
      toolActions: [{ toolName: tc.toolName, status, idempotencyKey: tc.idempotencyKey }],
      guardrailResult: 'safe',
      finalStatus: status === 'executed' ? 'action_executed' : 'action_failed',
      detail: { toolCallId: tc.id, result },
    });

    return tx.select().from(toolCalls).where(eq(toolCalls.id, tc.id)).get()!;
  });
}

/** Reject a pending action; it can never execute afterwards. */
export function rejectAction(params: { toolCallId: string; decidedBy: string; note?: string }): ToolCall {
  const db = getDb();
  return db.transaction((tx) => {
    const tc = tx.select().from(toolCalls).where(eq(toolCalls.id, params.toolCallId)).get();
    if (!tc) throw new ActionError('Tool call not found', 'not_found');
    if (tc.status === 'executed') throw new ActionError('Action already executed; cannot reject', 'conflict');
    if (tc.status === 'rejected') return tc; // idempotent reject

    const now = new Date().toISOString();
    tx.insert(approvals)
      .values({
        id: newId(),
        toolCallId: tc.id,
        decision: 'rejected',
        decidedBy: params.decidedBy,
        decidedAt: now,
        note: params.note ?? null,
      })
      .run();
    tx.update(toolCalls).set({ status: 'rejected', updatedAt: now }).where(eq(toolCalls.id, tc.id)).run();
    return tx.select().from(toolCalls).where(eq(toolCalls.id, tc.id)).get()!;
  });
}

/**
 * The concrete, idempotent side effects. Each derives a deterministic id from the
 * idempotency_key so a repeated execution cannot create a second real artifact.
 */
function executeEffect(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  tc: ToolCall,
): Record<string, unknown> {
  const keyHash = sha256(tc.idempotencyKey).slice(0, 12);
  const now = new Date().toISOString();

  if (tc.toolName === 'start_refund_review') {
    const orderId = String(tc.args.order_id ?? '');
    const amountCents = Number(tc.args.amount_cents ?? 0);
    if (!orderId) throw new ActionError('order_id required', 'bad_request');
    return {
      reviewId: `RRV-${keyHash}`,
      orderId,
      amountCents,
      state: 'refund_review_opened',
      openedAt: now,
      reason: String(tc.args.reason ?? ''),
    };
  }

  if (tc.toolName === 'create_replacement_order') {
    const originalOrderId = String(tc.args.order_id ?? '');
    const sku = String(tc.args.sku ?? '');
    if (!originalOrderId || !sku) throw new ActionError('order_id and sku required', 'bad_request');
    const original = tx.select().from(orders).where(eq(orders.id, originalOrderId)).get();
    if (!original) throw new ActionError(`Original order not found: ${originalOrderId}`, 'bad_request');

    const replacementId = `ORD-REP-${keyHash}`;
    // Idempotent: same key ⇒ same replacement id ⇒ insert is a no-op on retry.
    tx.insert(orders)
      .values({
        id: replacementId,
        customerId: original.customerId,
        purchaseDate: now, // replacement is issued now — anchors its own windows
        registeredAt: now,
        status: 'placed',
        itemSku: sku,
        itemName: original.itemName,
        quantity: 1,
        amountCents: 0,
        currency: original.currency,
        deliveredAt: null,
      })
      .onConflictDoNothing()
      .run();

    return {
      replacementOrderId: replacementId,
      originalOrderId,
      sku,
      state: 'replacement_created',
      createdAt: now,
    };
  }

  throw new ActionError(`Unknown tool: ${tc.toolName}`, 'bad_request');
}
