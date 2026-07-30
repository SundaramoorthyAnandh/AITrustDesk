import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { customers, customerAccounts, agentAccounts, refreshTokens } from '../db/schema.js';
import { hashPassword, verifyPassword, isPasswordAcceptable } from '../auth/password.js';
import { issueTokens, type IssuedTokens, type Principal } from '../auth/tokens.js';
import { newId, prefixedId } from '../lib/ids.js';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_credentials' | 'conflict' | 'bad_request' | 'locked',
  ) {
    super(message);
  }
}

const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

export interface AuthResult {
  tokens: IssuedTokens;
  principal: Principal;
  profile: Record<string, unknown>;
}

/* ─────────────── Customer (self-registration) ─────────────── */

export async function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new AuthError('Valid email required', 'bad_request');
  if (!isPasswordAcceptable(input.password)) throw new AuthError('Password must be 8-200 chars', 'bad_request');
  if (!input.name.trim()) throw new AuthError('Name required', 'bad_request');

  const db = getDb();
  const existing = db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).get();
  if (existing) throw new AuthError('An account with that email already exists', 'conflict');

  const now = new Date().toISOString();
  const customerId = prefixedId('CUST'); // CUST-<uuid>, matching seed + portal style
  const accountId = newId();
  const passwordHash = await hashPassword(input.password);

  db.insert(customers)
    .values({
      id: customerId,
      name: input.name.trim(),
      email,
      emailVerified: false,
      identityVerified: false,
      createdAt: now,
    })
    .run();
  db.insert(customerAccounts)
    .values({
      id: accountId,
      customerId,
      email,
      passwordHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const principal: Principal = { type: 'customer', accountId, role: 'customer', customerId };
  return {
    tokens: issueTokens(principal),
    principal,
    profile: { accountId, customerId, name: input.name.trim(), email },
  };
}

export async function loginCustomer(input: { email: string; password: string }): Promise<AuthResult> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const acct = db.select().from(customerAccounts).where(eq(customerAccounts.email, email)).get();
  if (!acct) throw new AuthError('Invalid email or password', 'invalid_credentials');
  assertNotLocked(acct.lockedUntil, acct.status);

  const ok = await verifyPassword(input.password, acct.passwordHash);
  if (!ok) {
    registerFailure('customer', acct.id, acct.failedLoginCount);
    throw new AuthError('Invalid email or password', 'invalid_credentials');
  }
  clearFailures('customer', acct.id);

  const customer = db.select().from(customers).where(eq(customers.id, acct.customerId)).get();
  const principal: Principal = {
    type: 'customer',
    accountId: acct.id,
    role: 'customer',
    customerId: acct.customerId,
  };
  return {
    tokens: issueTokens(principal),
    principal,
    profile: {
      accountId: acct.id,
      customerId: acct.customerId,
      name: customer?.name ?? '',
      email: acct.email,
      identityVerified: customer?.identityVerified ?? false,
    },
  };
}

/* ─────────────── Agent (admin-provisioned) ─────────────── */

export async function loginAgent(input: { email: string; password: string }): Promise<AuthResult> {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const acct = db.select().from(agentAccounts).where(eq(agentAccounts.email, email)).get();
  if (!acct) throw new AuthError('Invalid email or password', 'invalid_credentials');
  assertNotLocked(acct.lockedUntil, acct.status);

  const ok = await verifyPassword(input.password, acct.passwordHash);
  if (!ok) {
    registerFailure('agent', acct.id, acct.failedLoginCount);
    throw new AuthError('Invalid email or password', 'invalid_credentials');
  }
  clearFailures('agent', acct.id);

  const principal: Principal = { type: 'agent', accountId: acct.id, role: acct.role };
  return {
    tokens: issueTokens(principal),
    principal,
    profile: { accountId: acct.id, name: acct.name, email: acct.email, role: acct.role },
  };
}

/* ─────────────── Shared helpers ─────────────── */

function assertNotLocked(lockedUntil: string | null, status: string): void {
  if (status !== 'active') throw new AuthError('Account is not active', 'locked');
  if (lockedUntil && Date.parse(lockedUntil) > Date.now()) {
    throw new AuthError('Account temporarily locked due to failed logins', 'locked');
  }
}

function registerFailure(type: 'customer' | 'agent', id: string, current: number): void {
  const db = getDb();
  const next = current + 1;
  const lockedUntil = next >= MAX_FAILED ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  const table = type === 'customer' ? customerAccounts : agentAccounts;
  db.update(table)
    .set({ failedLoginCount: next, lockedUntil, updatedAt: new Date().toISOString() })
    .where(eq(table.id, id))
    .run();
}

function clearFailures(type: 'customer' | 'agent', id: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const table = type === 'customer' ? customerAccounts : agentAccounts;
  db.update(table)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
    .where(eq(table.id, id))
    .run();
}

/**
 * Change the password of the signed-in principal.
 *
 * Requires the current password (a logged-in session alone is not enough — this
 * blocks a hijacked tab from locking the owner out). On success every refresh
 * token for that principal is revoked, so other sessions are signed out.
 */
export async function changePassword(input: {
  principalType: 'customer' | 'agent';
  accountId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const db = getDb();
  const table = input.principalType === 'customer' ? customerAccounts : agentAccounts;

  const acct = db.select().from(table).where(eq(table.id, input.accountId)).get();
  if (!acct) throw new AuthError('Account not found', 'invalid_credentials');
  assertNotLocked(acct.lockedUntil, acct.status);

  const ok = await verifyPassword(input.currentPassword, acct.passwordHash);
  if (!ok) throw new AuthError('Current password is incorrect', 'invalid_credentials');

  if (!isPasswordAcceptable(input.newPassword)) {
    throw new AuthError('New password must be 8-200 characters', 'bad_request');
  }
  if (await verifyPassword(input.newPassword, acct.passwordHash)) {
    throw new AuthError('New password must be different from the current one', 'bad_request');
  }

  const now = new Date().toISOString();
  db.update(table)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: now })
    .where(eq(table.id, input.accountId))
    .run();

  // Invalidate every existing session for this principal.
  db.update(refreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(refreshTokens.principalType, input.principalType),
        eq(refreshTokens.principalId, input.accountId),
      ),
    )
    .run();
}

export function getCustomerProfile(accountId: string): Record<string, unknown> | null {
  const db = getDb();
  const acct = db.select().from(customerAccounts).where(eq(customerAccounts.id, accountId)).get();
  if (!acct) return null;
  const customer = db.select().from(customers).where(eq(customers.id, acct.customerId)).get();
  return {
    accountId: acct.id,
    customerId: acct.customerId,
    name: customer?.name ?? '',
    email: acct.email,
    identityVerified: customer?.identityVerified ?? false,
  };
}

export function getAgentProfile(accountId: string): Record<string, unknown> | null {
  const db = getDb();
  const acct = db.select().from(agentAccounts).where(eq(agentAccounts.id, accountId)).get();
  if (!acct) return null;
  return { accountId: acct.id, name: acct.name, email: acct.email, role: acct.role };
}

/** Resolve a rotated refresh token's principal back into a full Principal. */
export function principalFromRefresh(principalType: 'customer' | 'agent', principalId: string): Principal | null {
  const db = getDb();
  if (principalType === 'customer') {
    const acct = db.select().from(customerAccounts).where(eq(customerAccounts.id, principalId)).get();
    if (!acct) return null;
    return { type: 'customer', accountId: acct.id, role: 'customer', customerId: acct.customerId };
  }
  const acct = db.select().from(agentAccounts).where(eq(agentAccounts.id, principalId)).get();
  if (!acct) return null;
  return { type: 'agent', accountId: acct.id, role: acct.role };
}
