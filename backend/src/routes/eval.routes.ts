import type { FastifyInstance } from 'fastify';
import { desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { evalRuns } from '../db/schema.js';
import { requireAgent } from '../auth/preHandlers.js';
import { runEval } from '../eval/runner.js';
import { jobQueue } from '../jobs/queue.js';

export async function evalRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // POST /agent/eval — kick off an eval run (non-blocking job)
  app.post('/agent/eval', { preHandler: requireAgent }, async (_req, reply) => {
    const job = jobQueue.enqueue('eval', () => runEval());
    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  // GET /agent/eval/latest — most recent persisted summary
  app.get('/agent/eval/latest', { preHandler: requireAgent }, async (_req, reply) => {
    const latest = db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).get();
    return reply.send({ run: latest ?? null });
  });

  // GET /agent/eval/runs — history
  app.get('/agent/eval/runs', { preHandler: requireAgent }, async (_req, reply) => {
    return reply.send({
      runs: db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).limit(20).all(),
    });
  });
}
