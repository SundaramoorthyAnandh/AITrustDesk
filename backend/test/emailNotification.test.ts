import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { runDraft } from '../src/services/draft.js';
import { seedId } from '../src/lib/ids.js';
import { getSentEmails, clearSentEmails } from '../src/services/email.service.js';

describe('Agent Reply Email Notification', () => {
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

  beforeEach(() => {
    clearSentEmails();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('sends an email notification to the customer when an agent sends a reply draft', async () => {
    const ticketId = seedId('TCK-9009');
    const { draft } = await runDraft(ticketId);
    expect(draft.status).toBe('draft');

    const res = await app.inject({
      method: 'POST',
      url: `/agent/drafts/${draft.id}/send`,
      headers: auth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('sent');
    expect(res.json().emailSent).toBe(true);

    const sentEmails = getSentEmails(ticketId);
    expect(sentEmails.length).toBe(1);

    const email = sentEmails[0];
    expect(email.to).toBeTruthy();
    expect(email.subject).toContain('Update on your complaint');
    expect(email.body).toContain(draft.text);
    expect(email.body).toContain('TrustDesk Support Team');
  });
});
