import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { runDraft } from '../src/services/draft.js';
import { seedId } from '../src/lib/ids.js';

describe('Multi-turn Customer Conversation & Ticket Closing', () => {
  let app: FastifyInstance;
  let customerToken: string;
  let agentToken: string;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();

    // Login customer & agent
    const custLogin = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'carla.diaz@example.com', password: 'Password123!' },
    });
    customerToken = custLogin.json().accessToken;

    const agtLogin = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { email: 'agent@trustdesk.io', password: 'Password123!' },
    });
    agentToken = agtLogin.json().accessToken;
  });

  const custAuth = () => ({ authorization: `Bearer ${customerToken}` });
  const agtAuth = () => ({ authorization: `Bearer ${agentToken}` });

  it('allows customer to send follow-up replies and records multi-turn conversation', async () => {
    const ticketId = seedId('TCK-9009'); // Carla's ticket

    // 1. Agent sends reply
    const { draft } = await runDraft(ticketId);
    await app.inject({
      method: 'POST',
      url: `/agent/drafts/${draft.id}/send`,
      headers: agtAuth(),
    });

    // 2. Customer sends a reply back
    const replyRes = await app.inject({
      method: 'POST',
      url: `/me/tickets/${ticketId}/reply`,
      headers: custAuth(),
      payload: { text: 'Thank you for the update! Here is the additional information requested.' },
    });

    expect(replyRes.statusCode).toBe(201);
    expect(replyRes.json().reply.text).toContain('Thank you for the update');
    expect(replyRes.json().reply.status).toBe('customer_reply');

    // 3. Customer fetches ticket detail and sees both agent reply and customer reply
    const detailRes = await app.inject({
      method: 'GET',
      url: `/me/tickets/${ticketId}`,
      headers: custAuth(),
    });

    expect(detailRes.statusCode).toBe(200);
    const { ticket, replies } = detailRes.json();
    expect(ticket.status).toBe('awaiting_agent');
    expect(replies.length).toBeGreaterThanOrEqual(2);
  });

  it('allows agent to close a ticket and prevents customer replies when closed', async () => {
    const ticketId = seedId('TCK-9009');

    // 1. Agent closes ticket
    const closeRes = await app.inject({
      method: 'PATCH',
      url: `/agent/tickets/${ticketId}`,
      headers: agtAuth(),
      payload: { status: 'closed' },
    });

    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().ticket.status).toBe('closed');

    // 2. Customer attempts to reply to closed ticket -> rejected
    const replyRes = await app.inject({
      method: 'POST',
      url: `/me/tickets/${ticketId}/reply`,
      headers: custAuth(),
      payload: { text: 'Trying to post to a closed complaint' },
    });

    expect(replyRes.statusCode).toBe(400);
    expect(replyRes.json().message).toContain('closed');
  });

  it('allows customer to close and reopen their own complaint', async () => {
    const ticketId = seedId('TCK-9009');

    // Customer closes complaint
    const closeRes = await app.inject({
      method: 'PATCH',
      url: `/me/tickets/${ticketId}`,
      headers: custAuth(),
      payload: { status: 'closed' },
    });
    expect(closeRes.statusCode).toBe(200);
    expect(closeRes.json().ticket.status).toBe('closed');

    // Customer reopens complaint
    const reopenRes = await app.inject({
      method: 'PATCH',
      url: `/me/tickets/${ticketId}`,
      headers: custAuth(),
      payload: { status: 'open' },
    });
    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json().ticket.status).toBe('open');
  });
});
