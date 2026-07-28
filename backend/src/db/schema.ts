import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * TrustDesk schema (SQLite / Drizzle).
 *
 * Design notes (see DESIGN_DECISIONS.md):
 *  - Source-provided IDs (customers, orders, tickets, documents) use TEXT PKs and
 *    are stored VERBATIM — evals match on strings like `KB-REFUND-001`.
 *  - System-generated rows use UUID TEXT PKs (crypto.randomUUID via newId()).
 *  - Timestamps are ISO-8601 TEXT (UTC). The time rule compares ticket.created_at
 *    and order.order_date — never Date.now() (see domain/time.ts).
 *  - JSON columns use text({mode:'json'}) so the DB stays portable to Postgres.
 *  - AUTH IS SPLIT: customers and agents authenticate against physically separate
 *    tables (customer_accounts / agent_accounts) with independent credentials,
 *    lockout counters, and JWT audiences. There is no shared identity row, so a
 *    customer credential can never resolve to an agent principal.
 */

/* ───────────────────────────── Domain: people & orders ───────────────────────────── */

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(), // e.g. CUST-1001 (source-provided, verbatim)
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    identityVerified: integer('identity_verified', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    emailIdx: index('customers_email_idx').on(t.email),
  }),
);

export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(), // e.g. ORD-5001
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    orderDate: text('order_date').notNull(), // ISO date — anchor for the time rule
    status: text('status').notNull(), // placed | shipped | delivered | cancelled | returned
    itemSku: text('item_sku'),
    itemName: text('item_name'),
    quantity: integer('quantity').notNull().default(1),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),
    deliveredAt: text('delivered_at'),
  },
  (t) => ({
    customerIdx: index('orders_customer_idx').on(t.customerId),
    statusIdx: index('orders_status_idx').on(t.status),
  }),
);

/* ───────────────────────────── Auth: separate customer / agent identities ───────────────────────────── */

/** Customers self-register here; linked 1:1 to a domain `customers` row. */
export const customerAccounts = sqliteTable(
  'customer_accounts',
  {
    id: text('id').primaryKey(), // uuid
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'), // active | locked | disabled
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: text('locked_until'),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('customer_accounts_email_unique').on(t.email),
    customerUnique: uniqueIndex('customer_accounts_customer_unique').on(t.customerId),
  }),
);

/** Support agents. Provisioned by an admin (never self-registration). */
export const agentAccounts = sqliteTable(
  'agent_accounts',
  {
    id: text('id').primaryKey(), // uuid
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('agent'), // agent | supervisor | admin
    status: text('status').notNull().default('active'), // active | locked | disabled
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: text('locked_until'),
    lastLoginAt: text('last_login_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('agent_accounts_email_unique').on(t.email),
  }),
);

/**
 * Refresh tokens for BOTH principal types (rotation + revocation).
 * We store only a SHA-256 hash of the token, never the raw value.
 * `principalType` keeps customer and agent sessions in one physical table
 * while remaining logically isolated (never join across types).
 */
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(), // uuid (also the JWT `jti`)
    principalType: text('principal_type').notNull(), // customer | agent
    principalId: text('principal_id').notNull(), // customer_accounts.id | agent_accounts.id
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    principalIdx: index('refresh_tokens_principal_idx').on(t.principalType, t.principalId),
    hashIdx: index('refresh_tokens_hash_idx').on(t.tokenHash),
  }),
);

/* ───────────────────────────── Support tickets ───────────────────────────── */

export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id').primaryKey(), // TCK-... (source or generated)
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    orderId: text('order_id').references(() => orders.id), // nullable
    subject: text('subject'),
    body: text('body').notNull(),
    channel: text('channel').notNull().default('portal'), // portal | email | chat
    status: text('status').notNull().default('open'), // open | triaged | awaiting_agent | awaiting_customer | resolved | closed
    category: text('category'), // set by triage
    priority: text('priority'), // set by triage
    escalated: integer('escalated', { mode: 'boolean' }), // set by triage
    assignedAgentId: text('assigned_agent_id').references(() => agentAccounts.id),
    createdAt: text('created_at').notNull(), // anchor for the time rule
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    customerIdx: index('tickets_customer_idx').on(t.customerId),
    orderIdx: index('tickets_order_idx').on(t.orderId),
    statusIdx: index('tickets_status_idx').on(t.status),
    priorityIdx: index('tickets_priority_idx').on(t.priority),
    createdIdx: index('tickets_created_idx').on(t.createdAt),
  }),
);

/* ───────────────────────────── Knowledge base ───────────────────────────── */

export const documents = sqliteTable(
  'documents',
  {
    docId: text('doc_id').primaryKey(), // KB-* — VERBATIM, evals depend on it
    title: text('title').notNull(),
    body: text('body').notNull(),
    category: text('category'),
    // Docs flagged unsafe are still retrievable but must be treated as pure DATA.
    isAdversarial: integer('is_adversarial', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    categoryIdx: index('documents_category_idx').on(t.category),
  }),
);

/* ───────────────────────────── AI outputs ───────────────────────────── */

export const drafts = sqliteTable(
  'drafts',
  {
    id: text('id').primaryKey(), // uuid
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id),
    text: text('text').notNull(),
    citations: text('citations', { mode: 'json' }).$type<string[]>().notNull().default([]),
    status: text('status').notNull(), // draft | refused | escalated | sent
    createdByAgentId: text('created_by_agent_id').references(() => agentAccounts.id),
    // Human-edit audit: set when an agent edits the AI draft before sending.
    editedByAgentId: text('edited_by_agent_id'),
    editedAt: text('edited_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    ticketIdx: index('drafts_ticket_idx').on(t.ticketId),
    statusIdx: index('drafts_status_idx').on(t.status),
  }),
);

/* ───────────────────────────── Approval-gated tool actions ───────────────────────────── */

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(), // uuid
    ticketId: text('ticket_id')
      .notNull()
      .references(() => tickets.id),
    toolName: text('tool_name').notNull(), // start_refund_review | create_replacement_order | ...
    args: text('args', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
    // The single most important safety column: same key ⇒ same effect, exactly once.
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('pending'), // pending | approved | rejected | executed | failed
    result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    recommendedByAgentId: text('recommended_by_agent_id').references(() => agentAccounts.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idempotencyUnique: uniqueIndex('tool_calls_idempotency_unique').on(t.idempotencyKey),
    ticketIdx: index('tool_calls_ticket_idx').on(t.ticketId),
    statusIdx: index('tool_calls_status_idx').on(t.status),
  }),
);

export const approvals = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(), // uuid
    toolCallId: text('tool_call_id')
      .notNull()
      .references(() => toolCalls.id),
    decision: text('decision').notNull(), // approved | rejected
    decidedBy: text('decided_by').notNull(), // agent_accounts.id
    decidedAt: text('decided_at').notNull(),
    note: text('note'),
  },
  (t) => ({
    toolCallIdx: index('approvals_tool_call_idx').on(t.toolCallId),
  }),
);

/* ───────────────────────────── Observability ───────────────────────────── */

/** Exactly one trace row per AI run. */
export const traces = sqliteTable(
  'traces',
  {
    id: text('id').primaryKey(), // uuid
    ticketId: text('ticket_id').references(() => tickets.id), // nullable for standalone eval runs
    runType: text('run_type').notNull(), // triage | draft | guardrail | eval
    retrievedDocIds: text('retrieved_doc_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    toolActions: text('tool_actions', { mode: 'json' }).$type<unknown[]>().notNull().default([]),
    guardrailResult: text('guardrail_result'), // safe | blocked:<reason> | null
    finalStatus: text('final_status').notNull(), // e.g. ok | refused | escalated | blocked
    provider: text('provider'), // mock | langchain
    latencyMs: integer('latency_ms'),
    detail: text('detail', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    ticketIdx: index('traces_ticket_idx').on(t.ticketId),
    runTypeIdx: index('traces_run_type_idx').on(t.runType),
    createdIdx: index('traces_created_idx').on(t.createdAt),
  }),
);

export const evalRuns = sqliteTable('eval_runs', {
  id: text('id').primaryKey(), // uuid
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  provider: text('provider').notNull().default('mock'),
  summary: text('summary', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/* ───────────────────────────── Tool catalog (reference data) ───────────────────────────── */

export const toolCatalog = sqliteTable('tool_catalog', {
  name: text('name').primaryKey(), // start_refund_review | ... (stable id / value)
  label: text('label'), // human-friendly display name for dropdowns
  description: text('description').notNull(),
  sensitive: integer('sensitive', { mode: 'boolean' }).notNull().default(true),
  requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(true),
  argsSchema: text('args_schema', { mode: 'json' }).$type<Record<string, unknown>>(),
});

/** Product catalog customers order from (reference data). */
export const products = sqliteTable('products', {
  sku: text('sku').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

/* ───────────────────────────── Inferred types ───────────────────────────── */

export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type ToolCall = typeof toolCalls.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Trace = typeof traces.$inferSelect;
export type EvalRun = typeof evalRuns.$inferSelect;
export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type AgentAccount = typeof agentAccounts.$inferSelect;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type ToolCatalogEntry = typeof toolCatalog.$inferSelect;
export type Product = typeof products.$inferSelect;

/** Convenience: the current schema epoch, bumped when tables change. */
export const SCHEMA_VERSION = 1 as const;
