import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';

/** Customer-facing knowledge base (read-only) — must never leak adversarial docs. */
describe('customer knowledge base', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();
    const login = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'alice.johnson@example.com', password: 'Password123!' },
    });
    token = login.json().accessToken;
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it('lists customer-visible KB articles and EXCLUDES the adversarial doc', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/kb', headers: auth() });
    expect(res.statusCode).toBe(200);
    const ids = res.json().documents.map((d: { docId: string }) => d.docId);
    expect(ids).toContain('KB-WARRANTY-001');
    expect(ids).toContain('KB-REFUND-001');
    expect(ids).not.toContain('KB-ADVERSARIAL-001'); // security: never exposed
    // each doc carries the fields the UI needs
    const w = res.json().documents.find((d: { docId: string }) => d.docId === 'KB-WARRANTY-001');
    expect(w.title).toBeTruthy();
    expect(w.body).toBeTruthy();
  });

  it('returns a single KB article by id', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/kb/KB-WARRANTY-001', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().document.docId).toBe('KB-WARRANTY-001');
    expect(res.json().document.body).toBeTruthy();
  });

  it('404s the adversarial doc (indistinguishable from missing)', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/kb/KB-ADVERSARIAL-001', headers: auth() });
    expect(res.statusCode).toBe(404);
  });

  it('404s an unknown doc', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/kb/KB-DOES-NOT-EXIST', headers: auth() });
    expect(res.statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/kb' });
    expect(res.statusCode).toBe(401);
  });
});
