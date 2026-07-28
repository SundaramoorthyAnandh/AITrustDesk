import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';

/**
 * Dual-auth integration (build-prompt §2 + separate customer/agent tables).
 * Verifies audience isolation: a customer token cannot access agent routes.
 */
describe('authentication & authorization', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();
  });

  it('rejects unauthenticated access to agent routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/agent/tickets' });
    expect(res.statusCode).toBe(401);
  });

  it('lets a seeded agent log in', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { email: 'agent@trustdesk.io', password: 'Password123!' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().accessToken).toBeTruthy();
  });

  it('lets a customer register and then log in', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/customer/register',
      payload: { name: 'Test User', email: 'test.user@example.com', password: 'Password123!' },
    });
    expect(reg.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'test.user@example.com', password: 'Password123!' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().profile.customerId).toMatch(/^CUST-/);
  });

  it('rejects a customer token on an agent-only route (audience isolation)', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'alice.johnson@example.com', password: 'Password123!' },
    });
    expect(login.statusCode).toBe(200);
    const customerToken = login.json().accessToken as string;

    const res = await app.inject({
      method: 'GET',
      url: '/agent/tickets',
      headers: { authorization: `Bearer ${customerToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('scopes customer ticket listing to the caller and rejects wrong credentials', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'alice.johnson@example.com', password: 'Password123!' },
    });
    const token = login.json().accessToken as string;

    const created = await app.inject({
      method: 'POST',
      url: '/me/tickets',
      headers: { authorization: `Bearer ${token}` },
      payload: { subject: 'Test complaint', body: 'Something went wrong with my order.' },
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({
      method: 'GET',
      url: '/me/tickets',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().tickets.length).toBeGreaterThan(0);

    const bad = await app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'alice.johnson@example.com', password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
  });
});
