import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getDb, getSqlite } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import {
  customers,
  orders,
  tickets,
  documents,
  toolCatalog,
  products,
  customerAccounts,
  agentAccounts,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { seedId, uuidV5 } from '../lib/ids.js';
import { hashPasswordSync } from '../auth/password.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf-8')) as T;
}

/** Deterministic UUID account id per email so re-seeding never duplicates. */
function accountId(prefix: string, email: string): string {
  return uuidV5(`${prefix}:${email.toLowerCase()}`);
}

interface RawCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  email_verified?: boolean;
  identity_verified?: boolean;
  created_at: string;
}
interface RawOrder {
  id: string;
  customer_id: string;
  order_date: string;
  status: string;
  item_sku?: string;
  item_name?: string;
  quantity?: number;
  amount_cents?: number;
  currency?: string;
  delivered_at?: string | null;
}
interface RawTicket {
  id: string;
  customer_id: string;
  order_id?: string | null;
  subject?: string;
  body: string;
  channel?: string;
  category?: string | null;
  priority?: string | null;
  escalated?: boolean | null;
  created_at: string;
}
interface RawDoc {
  doc_id: string;
  title: string;
  body: string;
  category?: string;
  is_adversarial?: boolean;
}
interface RawTool {
  name: string;
  label?: string;
  description: string;
  sensitive?: boolean;
  requires_approval?: boolean;
  args_schema?: Record<string, unknown>;
}
interface RawProduct {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  price_cents?: number;
  currency?: string;
  active?: boolean;
}

export function loadAll(nowIso = new Date().toISOString()): { counts: Record<string, number> } {
  const db = getDb();
  const counts: Record<string, number> = {};

  // ── customers ──
  const rawCustomers = readJson<RawCustomer[]>('customers.json');
  for (const c of rawCustomers) {
    db.insert(customers)
      .values({
        id: seedId(c.id),
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        emailVerified: Boolean(c.email_verified),
        identityVerified: Boolean(c.identity_verified),
        createdAt: c.created_at,
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          name: c.name,
          email: c.email,
          phone: c.phone ?? null,
          emailVerified: Boolean(c.email_verified),
          identityVerified: Boolean(c.identity_verified),
        },
      })
      .run();
  }
  counts.customers = rawCustomers.length;

  // ── orders ──
  const rawOrders = readJson<RawOrder[]>('orders.json');
  for (const o of rawOrders) {
    db.insert(orders)
      .values({
        id: seedId(o.id),
        customerId: seedId(o.customer_id),
        orderDate: o.order_date,
        status: o.status,
        itemSku: o.item_sku ?? null,
        itemName: o.item_name ?? null,
        quantity: o.quantity ?? 1,
        amountCents: o.amount_cents ?? 0,
        currency: 'INR',
        deliveredAt: o.delivered_at ?? null,
      })
      .onConflictDoUpdate({
        target: orders.id,
        set: {
          status: o.status,
          deliveredAt: o.delivered_at ?? null,
          amountCents: o.amount_cents ?? 0,
        },
      })
      .run();
  }
  counts.orders = rawOrders.length;

  // ── tickets ── (preserve provided triage fields if present, else leave for live triage)
  const rawTickets = readJson<RawTicket[]>('tickets.json');
  for (const t of rawTickets) {
    db.insert(tickets)
      .values({
        id: seedId(t.id),
        customerId: seedId(t.customer_id),
        orderId: t.order_id ? seedId(t.order_id) : null,
        subject: t.subject ?? null,
        body: t.body,
        channel: t.channel ?? 'portal',
        status: 'open',
        category: t.category ?? null,
        priority: t.priority ?? null,
        escalated: t.escalated ?? null,
        createdAt: t.created_at,
        updatedAt: t.created_at,
      })
      .onConflictDoUpdate({
        target: tickets.id,
        set: { subject: t.subject ?? null, body: t.body },
      })
      .run();
  }
  counts.tickets = rawTickets.length;

  // ── documents (KB) ── IDs preserved VERBATIM
  const rawDocs = readJson<RawDoc[]>('documents.json');
  for (const d of rawDocs) {
    db.insert(documents)
      .values({
        docId: d.doc_id,
        title: d.title,
        body: d.body,
        category: d.category ?? null,
        isAdversarial: Boolean(d.is_adversarial),
        createdAt: nowIso,
      })
      .onConflictDoUpdate({
        target: documents.docId,
        set: {
          title: d.title,
          body: d.body,
          category: d.category ?? null,
          isAdversarial: Boolean(d.is_adversarial),
        },
      })
      .run();
  }
  counts.documents = rawDocs.length;

  // ── tool catalog ──
  const rawTools = readJson<RawTool[]>('tool_catalog.json');
  for (const tool of rawTools) {
    db.insert(toolCatalog)
      .values({
        name: tool.name,
        label: tool.label ?? null,
        description: tool.description,
        sensitive: tool.sensitive ?? true,
        requiresApproval: tool.requires_approval ?? true,
        argsSchema: tool.args_schema ?? null,
      })
      .onConflictDoUpdate({
        target: toolCatalog.name,
        set: { label: tool.label ?? null, description: tool.description, argsSchema: tool.args_schema ?? null },
      })
      .run();
  }
  counts.tool_catalog = rawTools.length;

  // ── product catalog ──
  const rawProducts = readJson<RawProduct[]>('products.json');
  for (const p of rawProducts) {
    db.insert(products)
      .values({
        sku: p.sku,
        name: p.name,
        description: p.description ?? null,
        category: p.category ?? null,
        priceCents: p.price_cents ?? 0,
        currency: 'INR',
        active: p.active ?? true,
      })
      .onConflictDoUpdate({
        target: products.sku,
        set: { name: p.name, priceCents: p.price_cents ?? 0, category: p.category ?? null },
      })
      .run();
  }
  counts.products = rawProducts.length;

  // ── customer accounts (one per seed customer; idempotent) ──
  const defaultHash = hashPasswordSync(env.SEED_DEFAULT_PASSWORD);
  for (const c of rawCustomers) {
    db.insert(customerAccounts)
      .values({
        id: accountId('cacct', c.email),
        customerId: seedId(c.id),
        email: c.email.toLowerCase(),
        passwordHash: defaultHash,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing()
      .run();
  }
  counts.customer_accounts = rawCustomers.length;

  // ── agent accounts (admin-provisioned; idempotent) ──
  const seedAgents = [
    { name: 'Sam Agent', email: 'agent@trustdesk.io', role: 'agent' },
    { name: 'Riley Supervisor', email: 'supervisor@trustdesk.io', role: 'supervisor' },
    { name: 'Admin', email: 'admin@trustdesk.io', role: 'admin' },
  ];
  for (const a of seedAgents) {
    db.insert(agentAccounts)
      .values({
        id: accountId('aacct', a.email),
        name: a.name,
        email: a.email.toLowerCase(),
        passwordHash: defaultHash,
        role: a.role,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
      .onConflictDoNothing()
      .run();
  }
  counts.agent_accounts = seedAgents.length;

  return { counts };
}

// Standalone entry: `tsx src/loaders/load.ts`
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  runMigrations();
  const { counts } = loadAll();
  getSqlite().close();
  // eslint-disable-next-line no-console
  console.log('✅ Data loaded (idempotent). Row counts:', counts);
  // eslint-disable-next-line no-console
  console.log(`   Seed login password for all accounts: "${env.SEED_DEFAULT_PASSWORD}"`);
}
