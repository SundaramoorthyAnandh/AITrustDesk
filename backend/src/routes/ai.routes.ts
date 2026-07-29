import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { tickets, drafts } from '../db/schema.js';
import { requireAgent } from '../auth/preHandlers.js';
import { getRetriever } from '../container.js';
import { runTriage } from '../services/triage.js';
import { runDraft } from '../services/draft.js';
import { writeTrace } from '../services/traces.js';
import { sendTicketReplyEmail } from '../services/email.service.js';
import { jobQueue } from '../jobs/queue.js';

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  const ticketExists = (id: string) => Boolean(db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, id)).get());

  // POST /agent/tickets/:id/triage → non-blocking job
  app.post('/agent/tickets/:id/triage', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ticketExists(id)) return reply.code(404).send({ error: 'not_found' });
    const job = jobQueue.enqueue('triage', () => runTriage(id), { ticketId: id });
    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  // POST /agent/tickets/:id/draft → non-blocking job
  app.post('/agent/tickets/:id/draft', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ticketExists(id)) return reply.code(404).send({ error: 'not_found' });
    const agentId = req.principal!.accountId;
    const job = jobQueue.enqueue('draft', () => runDraft(id, { agentId }), { ticketId: id });
    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  // GET /agent/tickets/:id/search → retrieval preview (fast, synchronous)
  app.get('/agent/tickets/:id/search', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) return reply.code(404).send({ error: 'not_found' });
    const q = (req.query as { q?: string }).q ?? `${ticket.subject ?? ''} ${ticket.body}`;
    const hits = getRetriever().search(q, 6);
    return reply.send({ query: q, hits });
  });

  // GET /jobs/:jobId → status/polling for AI jobs
  app.get('/jobs/:jobId', { preHandler: requireAgent }, async (req, reply) => {
    const { jobId } = req.params as { jobId: string };
    const job = jobQueue.get(jobId);
    if (!job) return reply.code(404).send({ error: 'not_found' });
    return reply.send(job);
  });

  // PATCH /agent/drafts/:draftId → agent edits the AI draft before sending.
  // Only editable while status is 'draft' (a sent reply is immutable). The edit
  // is audited (who/when + a trace) so the human authorship is on record.
  const EditDraftSchema = z.object({
    text: z.string().min(1).max(4000),
    citations: z.array(z.string().min(1)).max(20).optional(),
  });
  app.patch('/agent/drafts/:draftId', { preHandler: requireAgent }, async (req, reply) => {
    const { draftId } = req.params as { draftId: string };
    const parsed = EditDraftSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });

    const draft = db.select().from(drafts).where(eq(drafts.id, draftId)).get();
    if (!draft) return reply.code(404).send({ error: 'not_found' });
    if (draft.status === 'sent') {
      return reply.code(409).send({ error: 'conflict', message: 'Sent replies cannot be edited.' });
    }

    const now = new Date().toISOString();
    const agentId = req.principal!.accountId;
    db.update(drafts)
      .set({
        text: parsed.data.text,
        ...(parsed.data.citations ? { citations: parsed.data.citations } : {}),
        editedByAgentId: agentId,
        editedAt: now,
      })
      .where(eq(drafts.id, draftId))
      .run();

    writeTrace({
      ticketId: draft.ticketId,
      runType: 'draft',
      guardrailResult: 'safe',
      finalStatus: 'edited',
      detail: { draftId, editedByAgentId: agentId },
    });

    return reply.send(db.select().from(drafts).where(eq(drafts.id, draftId)).get());
  });

  // POST /agent/drafts/:draftId/send → publish a grounded draft as a reply the customer can see
  app.post('/agent/drafts/:draftId/send', { preHandler: requireAgent }, async (req, reply) => {
    const { draftId } = req.params as { draftId: string };
    const draft = db.select().from(drafts).where(eq(drafts.id, draftId)).get();
    if (!draft) return reply.code(404).send({ error: 'not_found' });
    if (draft.status === 'sent') {
      return reply.code(409).send({ error: 'conflict', message: 'Reply has already been sent.' });
    }
    const now = new Date().toISOString();
    db.update(drafts).set({ status: 'sent' }).where(eq(drafts.id, draftId)).run();
    db.update(tickets).set({ status: 'awaiting_customer', updatedAt: now }).where(eq(tickets.id, draft.ticketId)).run();

    // Send conversation update email to the customer
    const email = await sendTicketReplyEmail(draft.ticketId, draft.text);

    return reply.send({ ...draft, status: 'sent', emailSent: Boolean(email) });
  });

  // GET /agent/tickets/:id/latest-draft → convenience for the workspace
  app.get('/agent/tickets/:id/latest-draft', { preHandler: requireAgent }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const latest = db.select().from(drafts).where(eq(drafts.ticketId, id)).orderBy(desc(drafts.createdAt)).get();
    return reply.send({ draft: latest ?? null });
  });
}
