import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';

/** Self-service password change (POST /auth/{customer,agent}/password). */
describe('change password', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initTestDb();
    app = await buildApp();
    await app.ready();
  });

  const loginCustomer = async (password: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/customer/login',
      payload: { email: 'bob.smith@example.com', password },
    });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/customer/password',
      payload: { currentPassword: 'Password123!', newPassword: 'Whatever123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong current password', async () => {
    const token = (await loginCustomer('Password123!')).json().accessToken;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/customer/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass1!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a too-short new password', async () => {
    const token = (await loginCustomer('Password123!')).json().accessToken;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/customer/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'Password123!', newPassword: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('changes the password, invalidates the old one, and revokes refresh tokens', async () => {
    const login = await loginCustomer('Password123!');
    const { accessToken, refreshToken } = login.json();

    const changed = await app.inject({
      method: 'POST',
      url: '/auth/customer/password',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { currentPassword: 'Password123!', newPassword: 'BrandNewPass1!' },
    });
    expect(changed.statusCode).toBe(204);

    // New password works, old one does not.
    expect((await loginCustomer('BrandNewPass1!')).statusCode).toBe(200);
    expect((await loginCustomer('Password123!')).statusCode).toBe(401);

    // Pre-existing sessions are revoked.
    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/customer/refresh',
      payload: { refreshToken },
    });
    expect(refreshed.statusCode).toBe(401);
  });

  it('lets an agent change their own password', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/agent/login',
      payload: { email: 'supervisor@trustdesk.io', password: 'Password123!' },
    });
    const token = login.json().accessToken;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/agent/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'Password123!', newPassword: 'SupervisorPass1!' },
    });
    expect(res.statusCode).toBe(204);
  });

  it('rejects a customer token on the agent password route', async () => {
    const token = (await loginCustomer('BrandNewPass1!')).json().accessToken;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/agent/password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'BrandNewPass1!', newPassword: 'Whatever1234!' },
    });
    expect(res.statusCode).toBe(401);
  });
});
