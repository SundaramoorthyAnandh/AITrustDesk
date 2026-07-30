import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { runDraft } from '../src/services/draft.js';
import { seedId } from '../src/lib/ids.js';
import { getDb } from '../src/db/client.js';
import { drafts, tickets } from '../src/db/schema.js';

describe('Draft Reply from Conversation History', () => {
  let app: FastifyInstance;
  let agentToken: string;
  let customerToken: string;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();

    const agtLogin = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { email: 'agent@trustdesk.io', password: 'Password123!' },
    });
    agentToken = agtLogin.json().accessToken;

    const custLogin = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'carla.diaz@example.com', password: 'Password123!' },
    });
    customerToken = custLogin.json().accessToken;
  });

  const agtAuth = () => ({ authorization: `Bearer ${agentToken}` });
  const custAuth = () => ({ authorization: `Bearer ${customerToken}` });

  it('generates draft reply acknowledging customer choice from conversation history', async () => {
    const ticketId = seedId('TCK-9009'); // Carla's warranty ticket

    // 1. Initial AI draft & send by agent
    const { draft: firstDraft } = await runDraft(ticketId);
    await app.inject({
      method: 'POST',
      url: `/agent/drafts/${firstDraft.id}/send`,
      headers: agtAuth(),
    });

    // 2. Customer replies "ok with replacement"
    await app.inject({
      method: 'POST',
      url: `/me/tickets/${ticketId}/reply`,
      headers: custAuth(),
      payload: { text: 'ok with replacement' },
    });

    // 3. Agent triggers new AI draft generation
    const { draft: secondDraft } = await runDraft(ticketId);

    expect(secondDraft.text).toContain('Thank you for confirming');
    expect(secondDraft.text).toContain('replacement under warranty');
    expect(secondDraft.text).not.toContain('If you’d like, I can arrange a replacement');
    expect(secondDraft.text).not.toContain('Based on our policy');
    expect(secondDraft.text).not.toContain('365-day window');
  });
});
