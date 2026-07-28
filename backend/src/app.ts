import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env, isTest } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';
import { ticketRoutes } from './routes/tickets.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { actionRoutes } from './routes/actions.routes.js';
import { evalRoutes } from './routes/eval.routes.js';

/** Turn CORS origin entries into strings or RegExps (supporting `*` wildcards). */
function toCorsOrigins(list: string[]): (string | RegExp)[] {
  return list.map((o) => {
    if (!o.includes('*')) return o;
    const escaped = o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });
}

/**
 * Build the Fastify app. Exported (not just started) so Vitest can drive it
 * via app.inject() without opening a socket.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isTest ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'info' },
    // Trust proxy for correct client IPs behind a load balancer (rate limiting).
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
  });

  // Tolerate empty-body POSTs (e.g. triage/draft/eval triggers) sent with an
  // application/json content-type — treat an empty body as {} instead of 400.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const raw = (body as string).trim();
    if (raw.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      (err as { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  await app.register(cors, {
    // Entries may contain `*` wildcards (e.g. https://*.onrender.com) → RegExp.
    origin: toCorsOrigins(env.CORS_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Basic abuse protection. Auth endpoints get a tighter budget below.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // In tests we don't want to trip limits.
    ...(isTest ? { max: 100_000 } : {}),
  });

  app.get('/health', async () => ({ status: 'ok', service: 'trustdesk-api', time: new Date().toISOString() }));

  // Route groups
  await app.register(authRoutes);
  await app.register(ticketRoutes);
  await app.register(aiRoutes);
  await app.register(actionRoutes);
  await app.register(evalRoutes);

  // Uniform error envelope.
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    reply.code(status).send({
      error: status >= 500 ? 'internal_error' : (err.code ?? 'error'),
      message: status >= 500 ? 'Internal server error' : err.message,
    });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: 'not_found', message: 'Route not found' });
  });

  return app;
}
