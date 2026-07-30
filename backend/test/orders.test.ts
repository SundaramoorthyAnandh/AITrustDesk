import { describe, it, expect, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { initTestDb } from './helpers.js';
import { buildApp } from '../src/app.js';

/** Customer order placement (product catalog + POST /me/orders). */
describe('customer order placement', () => {
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

  it('lists the product catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/products', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().products.length).toBeGreaterThan(0);
  });

  it('places an order priced from the catalog and scoped to the customer', async () => {
    // Use a SKU the seed customer doesn't already own (alice seeds AUD-WH-100 +
    // KIT-KNIFE-8), so the one-registration-per-product rule doesn't reject this.
    const NEW_SKU = 'ELC-CHRG-USB';
    // Read the catalog price so this stays correct as pricing changes.
    const catalog = await app.inject({ method: 'GET', url: '/me/products', headers: auth() });
    const unitPrice = catalog.json().products.find((p: { sku: string }) => p.sku === NEW_SKU).priceCents;

    const res = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: NEW_SKU, quantity: 2, purchaseDate: '2026-07-01' },
    });
    expect(res.statusCode).toBe(201);
    const { order } = res.json();
    expect(order.itemSku).toBe(NEW_SKU);
    expect(order.quantity).toBe(2);
    expect(order.amountCents).toBe(unitPrice * 2); // priced from the catalog, not the client
    expect(order.status).toBe('placed');
    expect(order.id).toMatch(/^ORD-/);
    // purchaseDate is the customer-supplied buy date; registeredAt is stamped now
    // and is distinct from (later than) the purchase date.
    expect(order.purchaseDate).toBe('2026-07-01T00:00:00.000Z');
    expect(order.registeredAt).toBeTruthy();
    expect(Date.parse(order.registeredAt)).toBeGreaterThan(Date.parse(order.purchaseDate));

    // It shows up in the customer's own order list.
    const list = await app.inject({ method: 'GET', url: '/me/orders', headers: auth() });
    expect(list.json().orders.some((o: { id: string }) => o.id === order.id)).toBe(true);
  });

  it('rejects a future purchase date', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: 'AUD-WH-100', quantity: 1, purchaseDate: '2999-01-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing purchase date', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: 'AUD-WH-100', quantity: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects registering the same product twice for one customer', async () => {
    const FRESH_SKU = 'ELC-PWRBNK'; // not seeded for alice, not used by other tests
    const first = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: FRESH_SKU, quantity: 1, purchaseDate: '2026-06-01' },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: FRESH_SKU, quantity: 1, purchaseDate: '2026-06-02' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('already_registered');
    expect(dup.json().message).toMatch(/already/i);
  });

  it('rejects re-registering a product already present from seed data', async () => {
    // alice seeds AUD-WH-100 — registering it again must be blocked.
    const res = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: 'AUD-WH-100', quantity: 1, purchaseDate: '2026-06-01' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('already_registered');
  });

  it('rejects an unknown product', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/orders',
      headers: auth(),
      payload: { sku: 'DOES-NOT-EXIST', quantity: 1, purchaseDate: '2026-07-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/me/orders', payload: { sku: 'AUD-WH-100', quantity: 1 } });
    expect(res.statusCode).toBe(401);
  });
});
