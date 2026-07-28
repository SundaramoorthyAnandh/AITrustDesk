import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  registerCustomer,
  loginCustomer,
  loginAgent,
  getCustomerProfile,
  getAgentProfile,
  principalFromRefresh,
  AuthError,
} from '../services/auth.service.js';
import { issueTokens, consumeRefreshToken, revokeRefreshToken } from '../auth/tokens.js';
import { requireCustomer, requireAgent } from '../auth/preHandlers.js';

const RegisterSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
const RefreshSchema = z.object({ refreshToken: z.string().min(10) });

function authErrorStatus(code: AuthError['code']): number {
  switch (code) {
    case 'invalid_credentials':
      return 401;
    case 'locked':
      return 423;
    case 'conflict':
      return 409;
    default:
      return 400;
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /* ───────── Customer ───────── */
  app.post('/auth/customer/register', async (req, reply) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    try {
      const result = await registerCustomer(parsed.data);
      return reply.code(201).send({ ...result.tokens, profile: result.profile });
    } catch (err) {
      if (err instanceof AuthError) return reply.code(authErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/auth/customer/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    try {
      const result = await loginCustomer(parsed.data);
      return reply.send({ ...result.tokens, profile: result.profile });
    } catch (err) {
      if (err instanceof AuthError) return reply.code(authErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/auth/customer/refresh', async (req, reply) => refreshHandler(req.body, 'customer', reply));
  app.post('/auth/customer/logout', async (req, reply) => logoutHandler(req.body, reply));
  app.get('/auth/customer/me', { preHandler: requireCustomer }, async (req, reply) => {
    const profile = getCustomerProfile(req.principal!.accountId);
    if (!profile) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ profile });
  });

  /* ───────── Agent (no self-registration) ───────── */
  app.post('/auth/agent/login', async (req, reply) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', details: parsed.error.flatten() });
    try {
      const result = await loginAgent(parsed.data);
      return reply.send({ ...result.tokens, profile: result.profile });
    } catch (err) {
      if (err instanceof AuthError) return reply.code(authErrorStatus(err.code)).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/auth/agent/refresh', async (req, reply) => refreshHandler(req.body, 'agent', reply));
  app.post('/auth/agent/logout', async (req, reply) => logoutHandler(req.body, reply));
  app.get('/auth/agent/me', { preHandler: requireAgent }, async (req, reply) => {
    const profile = getAgentProfile(req.principal!.accountId);
    if (!profile) return reply.code(404).send({ error: 'not_found' });
    return reply.send({ profile });
  });
}

async function refreshHandler(body: unknown, expected: 'customer' | 'agent', reply: import('fastify').FastifyReply) {
  const parsed = RefreshSchema.safeParse(body);
  if (!parsed.success) return reply.code(400).send({ error: 'bad_request' });
  const consumed = consumeRefreshToken(parsed.data.refreshToken);
  if (!consumed || consumed.principalType !== expected) {
    return reply.code(401).send({ error: 'unauthorized', message: 'Invalid refresh token' });
  }
  const principal = principalFromRefresh(consumed.principalType, consumed.principalId);
  if (!principal) return reply.code(401).send({ error: 'unauthorized' });
  return reply.send(issueTokens(principal));
}

async function logoutHandler(body: unknown, reply: import('fastify').FastifyReply) {
  const parsed = RefreshSchema.safeParse(body);
  if (parsed.success) revokeRefreshToken(parsed.data.refreshToken);
  return reply.code(204).send();
}
