import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { toolCalls, tickets, toolCatalog, approvals } from '../db/schema.js';
import { requireAgent } from '../auth/preHandlers.js';
import { recommendAction, approveAction, rejectAction, ActionError, type ToolName } from '../services/actions.js';

const RecommendSchema = z.object({
  toolName: z.enum(['start_refund_review', 'create_replacement_order']),
  args: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
const DecisionSchema = z.object({ note: z.string().max(1000).optional() });

function actionErrorStatus(code: ActionError['code']): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    default:
      return 400;
  }
}

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // GET /agent/catalog — available tools
  app.get('/agent/catalog', { preHandler: requireAgent }, async (_req, reply) => {
    return reply.send({ tools: db.select().from(toolCatalog).all() });
  });

  // POST /agent/tickets/:id/actions — AI/agent RECOMMENDS a sensitive action (pending)
  app.post('/agent/tickets/:id/actions', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, id)).get()) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const parsed = RecommendSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    const headerKey = req.headers['idempotency-key'];
    const idempotencyKey = parsed.data.idempotencyKey ?? (typeof headerKey === 'string' ? headerKey : undefined);

    try {
      const tc = recommendAction({
        ticketId: id,
        toolName: parsed.data.toolName as ToolName,
        args: parsed.data.args,
        idempotencyKey,
        agentId: req.principal!.accountId,
      });
      return reply.code(201).send(tc);
    } catch (err) {
      if (err instanceof ActionError) return reply.code(actionErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  // GET /agent/actions/:id
  app.get('/agent/actions/:id', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const tc = db.select().from(toolCalls).where(eq(toolCalls.id, id)).get();
    if (!tc) return reply.code(404).send({ error: 'not_found' });
    const decisions = db.select().from(approvals).where(eq(approvals.toolCallId, id)).orderBy(desc(approvals.decidedAt)).all();
    return reply.send({ ...tc, approvals: decisions });
  });

  // POST /agent/actions/:id/approve — executes exactly once (idempotent)
  app.post('/agent/actions/:id/approve', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = DecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    try {
      const tc = approveAction({ toolCallId: id, decidedBy: req.principal!.accountId, note: parsed.data.note });
      return reply.send(tc);
    } catch (err) {
      if (err instanceof ActionError) return reply.code(actionErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  // POST /agent/actions/:id/reject — prevents execution
  app.post('/agent/actions/:id/reject', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = DecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
    try {
      const tc = rejectAction({ toolCallId: id, decidedBy: req.principal!.accountId, note: parsed.data.note });
      return reply.send(tc);
    } catch (err) {
      if (err instanceof ActionError) return reply.code(actionErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });
}
