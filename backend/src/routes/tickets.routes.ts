import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { tickets, customers, orders, drafts, toolCalls, traces, products } from '../db/schema.js';
import { requireAgent, requireCustomer } from '../auth/preHandlers.js';
import { getTicketContext } from '../services/context.js';
import { prefixedId } from '../lib/ids.js';

function ticketContextDTO(ticketId: string) {
  const ctx = getTicketContext(ticketId);
  if (!ctx) return null;
  return {
    ticket: ctx.ticket,
    customer: {
      id: ctx.customer.id,
      name: ctx.customer.name,
      email: ctx.customer.email,
      identityVerified: ctx.customer.identityVerified,
      emailVerified: ctx.customer.emailVerified,
    },
    order: ctx.order,
  };
}

const CreateTicketSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  orderId: z.string().optional().nullable(),
});

export async function ticketRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  /* ───────────────── Agent-facing ───────────────── */

  // GET /agent/tickets?status=&category=&escalated=&limit=&offset=
  app.get('/agent/tickets', { preHandler: requireAgent }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const conds = [];
    if (q.status) conds.push(eq(tickets.status, q.status));
    if (q.category) conds.push(eq(tickets.category, q.category));
    if (q.escalated === 'true') conds.push(eq(tickets.escalated, true));
    const limit = Math.min(Number(q.limit ?? 100), 200);
    const offset = Math.max(Number(q.offset ?? 0), 0);

    const rows = db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        status: tickets.status,
        category: tickets.category,
        priority: tickets.priority,
        escalated: tickets.escalated,
        createdAt: tickets.createdAt,
        updatedAt: tickets.updatedAt,
        customerId: customers.id,
        customerName: customers.name,
        orderId: tickets.orderId,
      })
      .from(tickets)
      .leftJoin(customers, eq(customers.id, tickets.customerId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(tickets.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({ tickets: rows, limit, offset });
  });

  // GET /agent/tickets/:id  → full customer + order context
  app.get('/agent/tickets/:id', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const dto = ticketContextDTO(id);
    if (!dto) return reply.code(404).send({ error: 'not_found' });
    return reply.send(dto);
  });

  // Sub-resources for the agent workspace
  app.get('/agent/tickets/:id/drafts', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({
      drafts: db.select().from(drafts).where(eq(drafts.ticketId, id)).orderBy(asc(drafts.createdAt)).all(),
    });
  });
  app.get('/agent/tickets/:id/actions', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({
      actions: db.select().from(toolCalls).where(eq(toolCalls.ticketId, id)).orderBy(desc(toolCalls.createdAt)).all(),
    });
  });
  app.get('/agent/tickets/:id/traces', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.send({
      traces: db.select().from(traces).where(eq(traces.ticketId, id)).orderBy(desc(traces.createdAt)).all(),
    });
  });

  // PATCH /agent/tickets/:id  → assign / change status
  const PatchSchema = z.object({
    status: z.enum(['open', 'triaged', 'awaiting_agent', 'awaiting_customer', 'resolved', 'closed']).optional(),
    assign: z.boolean().optional(),
  });
  app.patch('/agent/tickets/:id', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    const existing = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (parsed.data.status) patch.status = parsed.data.status;
    if (parsed.data.assign) patch.assignedAgentId = req.principal!.accountId;
    db.update(tickets).set(patch).where(eq(tickets.id, id)).run();
    return reply.send(ticketContextDTO(id));
  });

  /* ───────────────── Customer-facing (own tickets only) ───────────────── */

  // POST /me/tickets — file a complaint
  app.post('/me/tickets', { preHandler: requireCustomer }, async (req, reply) => {
    const parsed = CreateTicketSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    const customerId = req.principal!.customerId!;

    // If an order is referenced, it must belong to this customer.
    if (parsed.data.orderId) {
      const order = db.select().from(orders).where(eq(orders.id, parsed.data.orderId)).get();
      if (!order || order.customerId !== customerId) {
        return reply.code(400).send({ error: 'bad_request', message: 'Order not found for this account' });
      }
    }

    const now = new Date().toISOString();
    const id = prefixedId('TCK');
    db.insert(tickets)
      .values({
        id,
        customerId,
        orderId: parsed.data.orderId ?? null,
        subject: parsed.data.subject,
        body: parsed.data.body,
        channel: 'portal',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return reply.code(201).send(ticketContextDTO(id));
  });

  // GET /me/tickets — the caller's own tickets
  app.get('/me/tickets', { preHandler: requireCustomer }, async (req, reply) => {
    const customerId = req.principal!.customerId!;
    const rows = db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.createdAt))
      .all();
    return reply.send({ tickets: rows });
  });

  // GET /me/tickets/:id — own ticket with order context + non-refused drafts (agent replies & customer replies)
  app.get('/me/tickets/:id', { preHandler: requireCustomer }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customerId = req.principal!.customerId!;
    const ctx = getTicketContext(id);
    if (!ctx || ctx.ticket.customerId !== customerId) return reply.code(404).send({ error: 'not_found' });
    // Customers see agent replies ('sent') and their own follow-up replies ('customer_reply').
    const replies = db
      .select()
      .from(drafts)
      .where(and(eq(drafts.ticketId, id), inArray(drafts.status, ['sent', 'customer_reply'])))
      .orderBy(asc(drafts.createdAt))
      .all();
    return reply.send({ ticket: ctx.ticket, order: ctx.order, replies });
  });

  // POST /me/tickets/:id/reply — customer sends a follow-up reply to an open ticket
  const CustomerReplySchema = z.object({
    text: z.string().min(1).max(4000),
  });
  app.post('/me/tickets/:id/reply', { preHandler: requireCustomer }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customerId = req.principal!.customerId!;
    const parsed = CustomerReplySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });

    const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket || ticket.customerId !== customerId) return reply.code(404).send({ error: 'not_found' });
    if (ticket.status === 'closed') {
      return reply.code(400).send({ error: 'bad_request', message: 'Complaint is closed. No further replies can be added.' });
    }

    const now = new Date().toISOString();
    const draftId = prefixedId('DFT');
    db.insert(drafts)
      .values({
        id: draftId,
        ticketId: id,
        text: parsed.data.text,
        citations: [],
        status: 'customer_reply',
        createdAt: now,
      })
      .run();

    db.update(tickets)
      .set({ status: 'awaiting_agent', updatedAt: now })
      .where(eq(tickets.id, id))
      .run();

    const created = db.select().from(drafts).where(eq(drafts.id, draftId)).get();
    return reply.code(201).send({ reply: created });
  });

  // PATCH /me/tickets/:id — customer closes or reopens their own complaint
  const CustomerPatchSchema = z.object({
    status: z.enum(['closed', 'open', 'awaiting_agent', 'resolved']),
  });
  app.patch('/me/tickets/:id', { preHandler: requireCustomer }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const customerId = req.principal!.customerId!;
    const parsed = CustomerPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });

    const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket || ticket.customerId !== customerId) return reply.code(404).send({ error: 'not_found' });

    const now = new Date().toISOString();
    db.update(tickets)
      .set({ status: parsed.data.status, updatedAt: now })
      .where(eq(tickets.id, id))
      .run();

    const ctx = getTicketContext(id);
    const replies = db
      .select()
      .from(drafts)
      .where(and(eq(drafts.ticketId, id), inArray(drafts.status, ['sent', 'customer_reply'])))
      .orderBy(asc(drafts.createdAt))
      .all();
    return reply.send({ ticket: ctx!.ticket, order: ctx!.order, replies });
  });

  // GET /me/orders — the caller's orders (to attach to a complaint)
  app.get('/me/orders', { preHandler: requireCustomer }, async (req, reply) => {
    const customerId = req.principal!.customerId!;
    return reply.send({
      orders: db.select().from(orders).where(eq(orders.customerId, customerId)).orderBy(desc(orders.purchaseDate)).all(),
    });
  });

  // GET /me/products — catalog the customer can order from
  app.get('/me/products', { preHandler: requireCustomer }, async (_req, reply) => {
    return reply.send({
      products: db.select().from(products).where(eq(products.active, true)).orderBy(products.name).all(),
    });
  });

  // POST /me/orders — register a product the customer already purchased.
  // purchaseDate is customer-supplied (when they bought it) and anchors the
  // return/refund/warranty windows; registeredAt is server-stamped to "now".
  const CreateOrderSchema = z.object({
    sku: z.string().min(1),
    quantity: z.number().int().min(1).max(20).default(1),
    // ISO date (YYYY-MM-DD) or full ISO datetime; must not be in the future.
    purchaseDate: z
      .string()
      .min(1)
      .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid purchase date' })
      .refine((v) => Date.parse(v) <= Date.now(), { message: 'Purchase date cannot be in the future' }),
  });
  app.post('/me/orders', { preHandler: requireCustomer }, async (req, reply) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    const customerId = req.principal!.customerId!;

    const product = db.select().from(products).where(eq(products.sku, parsed.data.sku)).get();
    if (!product || !product.active) {
      return reply.code(400).send({ error: 'bad_request', message: 'Unknown or unavailable product' });
    }

    const now = new Date().toISOString();
    // Normalise a bare date (YYYY-MM-DD) to an ISO instant so window math is stable.
    const purchaseDate = new Date(parsed.data.purchaseDate).toISOString();
    const id = prefixedId('ORD');
    db.insert(orders)
      .values({
        id,
        customerId,
        purchaseDate, // when the product was bought — anchors the time-window rules
        registeredAt: now, // when it was registered with TrustDesk (audit only)
        status: 'placed',
        itemSku: product.sku,
        itemName: product.name,
        quantity: parsed.data.quantity,
        amountCents: product.priceCents * parsed.data.quantity,
        currency: product.currency,
        deliveredAt: null,
      })
      .run();

    const order = db.select().from(orders).where(eq(orders.id, id)).get();
    return reply.code(201).send({ order });
  });
}
