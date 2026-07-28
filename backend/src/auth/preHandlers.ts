import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { verifyAccess, type Principal, type PrincipalType } from './tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

function extractBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * Build a preHandler that requires a valid access token of a SPECIFIC principal
 * type. Because customer and agent tokens are signed with different secrets and
 * audiences, a customer token presented to an agent route fails verification —
 * the two auth domains cannot cross over.
 */
export function requirePrincipal(type: PrincipalType): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearer(req);
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }
    try {
      req.principal = verifyAccess(type, token);
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
  };
}

export const requireCustomer = requirePrincipal('customer');
export const requireAgent = requirePrincipal('agent');

/** Require an agent with one of the given roles (defense in depth for sensitive ops). */
export function requireAgentRole(...roles: string[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearer(req);
    if (!token) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Missing bearer token' });
    }
    try {
      req.principal = verifyAccess('agent', token);
    } catch {
      return reply.code(401).send({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
    if (roles.length > 0 && !roles.includes(req.principal.role)) {
      return reply.code(403).send({ error: 'forbidden', message: `Requires role: ${roles.join(', ')}` });
    }
  };
}
