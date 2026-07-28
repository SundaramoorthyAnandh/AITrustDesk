import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { seedId } from '../src/lib/ids.js';

/** Route-level mapping of the agency-limit guardrail to a 400 (not a 500). */
describe('recommend action route — agency limit', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { email: 'agent@trustdesk.io', password: 'Password123!' },
    });
    token = login.json().accessToken;
  });

  it('returns 400 when recommending an order-based action on a ticket with no order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/tickets/${seedId('TCK-9008')}/actions`, // no linked order
      headers: { authorization: `Bearer ${token}` },
      payload: { toolName: 'create_replacement_order', args: { sku: 'AUD-WH-100', reason: 'defective' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/no linked order/i);
  });

  it('accepts an order-based action on a ticket that has the matching order', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agent/tickets/${seedId('TCK-9001')}/actions`, // linked to ORD-5001
      headers: { authorization: `Bearer ${token}` },
      payload: { toolName: 'start_refund_review', args: { order_id: seedId('ORD-5001'), amount_cents: 1000, reason: 'test' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('pending');
  });
});
