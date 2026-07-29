import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';
import { runDraft } from '../src/services/draft.js';
import { seedId } from '../src/lib/ids.js';

/** Agent draft editing (PATCH /agent/drafts/:id) — human edit + audit + immutability. */
describe('agent draft editing', () => {
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

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('lets an agent edit a grounded draft and records the edit', async () => {
    const { draft } = await runDraft(seedId('TCK-9009')); // refund within window → status "draft"
    expect(draft.status).toBe('draft');

    const res = await app.inject({
      method: 'PATCH',
      url: `/agent/drafts/${draft.id}`,
      headers: auth(),
      payload: { text: 'Hi Carla — happy to help with your return. I have started the refund review.' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.text).toContain('happy to help');
    expect(updated.editedByAgentId).toBeTruthy();
    expect(updated.editedAt).toBeTruthy();
    expect(updated.citations).toContain('KB-REFUND-001'); // citations preserved
  });

  it('rejects an empty edit and a missing draft', async () => {
    const { draft } = await runDraft(seedId('TCK-9009'));
    const empty = await app.inject({ method: 'PATCH', url: `/agent/drafts/${draft.id}`, headers: auth(), payload: { text: '' } });
    expect(empty.statusCode).toBe(400);
    const missing = await app.inject({ method: 'PATCH', url: '/agent/drafts/does-not-exist', headers: auth(), payload: { text: 'x' } });
    expect(missing.statusCode).toBe(404);
  });

  it('makes a sent reply immutable', async () => {
    const { draft } = await runDraft(seedId('TCK-9009'));
    const sent = await app.inject({ method: 'POST', url: `/agent/drafts/${draft.id}/send`, headers: auth() });
    expect(sent.statusCode).toBe(200);
    const edit = await app.inject({ method: 'PATCH', url: `/agent/drafts/${draft.id}`, headers: auth(), payload: { text: 'too late' } });
    expect(edit.statusCode).toBe(409);
  });

  it('requires authentication', async () => {
    const { draft } = await runDraft(seedId('TCK-9009'));
    const res = await app.inject({ method: 'PATCH', url: `/agent/drafts/${draft.id}`, payload: { text: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('allows sending an escalated draft to the customer', async () => {
    const { draft } = await runDraft(seedId('TCK-9008')); // escalated ticket
    expect(draft.status).toBe('escalated');

    const sendRes = await app.inject({
      method: 'POST',
      url: `/agent/drafts/${draft.id}/send`,
      headers: auth(),
    });
    expect(sendRes.statusCode).toBe(200);
    expect(sendRes.json().status).toBe('sent');
  });
});
