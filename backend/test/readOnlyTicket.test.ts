import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { runDraft } from '../src/services/draft.js';
import { seedId } from '../src/lib/ids.js';

/**
 * A closed/resolved ticket is read-only server-side: every mutating agent
 * endpoint rejects with 409 until the ticket is reopened.
 */
describe('read-only closed/resolved ticket', () => {
  let app: FastifyInstance;
  let token: string;
  const tid = seedId('TCK-9009'); // Carla, refund-within-window

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

  const auth = () => ({ authorization: `Bearer ${token}` });
  const setStatus = async (status: string) => {
    const r = await app.inject({ method: 'PATCH', url: `/agent/tickets/${tid}`, headers: auth(), payload: { status } });
    expect(r.statusCode).toBe(200);
  };

  it('blocks every mutation while closed, and lifts on reopen', async () => {
    const { draft } = await runDraft(tid); // a draft exists to attempt edit/send on

    await setStatus('closed');

    const triage = await app.inject({ method: 'POST', url: `/agent/tickets/${tid}/triage`, headers: auth() });
    expect(triage.statusCode).toBe(409);
    expect(triage.json().error).toBe('ticket_read_only');

    const draftGen = await app.inject({ method: 'POST', url: `/agent/tickets/${tid}/draft`, headers: auth() });
    expect(draftGen.statusCode).toBe(409);

    const edit = await app.inject({ method: 'PATCH', url: `/agent/drafts/${draft.id}`, headers: auth(), payload: { text: 'x' } });
    expect(edit.statusCode).toBe(409);

    const send = await app.inject({ method: 'POST', url: `/agent/drafts/${draft.id}/send`, headers: auth() });
    expect(send.statusCode).toBe(409);

    const recommend = await app.inject({
      method: 'POST',
      url: `/agent/tickets/${tid}/actions`,
      headers: auth(),
      payload: { toolName: 'start_refund_review', args: {} },
    });
    expect(recommend.statusCode).toBe(409);

    // Reopen → mutations are accepted again.
    await setStatus('open');
    const triageAgain = await app.inject({ method: 'POST', url: `/agent/tickets/${tid}/triage`, headers: auth() });
    expect(triageAgain.statusCode).toBe(202);
  });

  it('treats a resolved ticket as read-only too', async () => {
    await setStatus('resolved');
    const r = await app.inject({ method: 'POST', url: `/agent/tickets/${tid}/draft`, headers: auth() });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('ticket_read_only');
    await setStatus('open');
  });
});
