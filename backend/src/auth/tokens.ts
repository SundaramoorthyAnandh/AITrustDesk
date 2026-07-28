import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { refreshTokens } from '../db/schema.js';
import { env } from '../config/env.js';
import { newId, sha256 } from '../lib/ids.js';

export type PrincipalType = 'customer' | 'agent';

export interface AccessClaims {
  typ: PrincipalType;
  role?: string;
  /** For customers: the linked domain customers.id. */
  cid?: string;
}

export interface Principal {
  type: PrincipalType;
  accountId: string;
  role: string;
  customerId?: string;
}

const AUDIENCE: Record<PrincipalType, string> = {
  customer: 'trustdesk-customer',
  agent: 'trustdesk-agent',
};

function secretFor(type: PrincipalType): string {
  return type === 'customer' ? env.CUSTOMER_JWT_SECRET : env.AGENT_JWT_SECRET;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/** Issue an access JWT (short-lived) + an opaque, hashed refresh token (rotatable). */
export function issueTokens(principal: Principal): IssuedTokens {
  const claims: AccessClaims = { typ: principal.type, role: principal.role, cid: principal.customerId };
  const accessToken = jwt.sign(claims, secretFor(principal.type), {
    subject: principal.accountId,
    audience: AUDIENCE[principal.type],
    issuer: 'trustdesk',
    expiresIn: env.ACCESS_TOKEN_TTL,
  });

  const raw = randomBytes(48).toString('hex');
  const now = Date.now();
  getDb()
    .insert(refreshTokens)
    .values({
      id: newId(),
      principalType: principal.type,
      principalId: principal.accountId,
      tokenHash: sha256(raw),
      expiresAt: new Date(now + env.REFRESH_TOKEN_TTL * 1000).toISOString(),
      createdAt: new Date(now).toISOString(),
    })
    .run();

  return { accessToken, refreshToken: raw, tokenType: 'Bearer', expiresIn: env.ACCESS_TOKEN_TTL };
}

/** Verify an access token for the EXPECTED principal type (audience-isolated). */
export function verifyAccess(type: PrincipalType, token: string): Principal {
  const decoded = jwt.verify(token, secretFor(type), {
    audience: AUDIENCE[type],
    issuer: 'trustdesk',
  }) as jwt.JwtPayload & AccessClaims;

  if (decoded.typ !== type || !decoded.sub) {
    throw new Error('Token principal mismatch');
  }
  return {
    type,
    accountId: decoded.sub,
    role: decoded.role ?? type,
    customerId: decoded.cid,
  };
}

/**
 * Rotate a refresh token: validate, revoke the old one, and hand back the
 * principal so the caller can mint a fresh pair. Returns null if invalid/expired.
 */
export function consumeRefreshToken(rawToken: string): { principalType: PrincipalType; principalId: string } | null {
  const db = getDb();
  const hash = sha256(rawToken);
  const row = db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).get();
  if (!row || row.revokedAt || Date.parse(row.expiresAt) < Date.now()) return null;

  db.update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.id, row.id))
    .run();

  return { principalType: row.principalType as PrincipalType, principalId: row.principalId };
}

/** Logout: revoke a specific refresh token. */
export function revokeRefreshToken(rawToken: string): void {
  getDb()
    .update(refreshTokens)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(refreshTokens.tokenHash, sha256(rawToken)))
    .run();
}
