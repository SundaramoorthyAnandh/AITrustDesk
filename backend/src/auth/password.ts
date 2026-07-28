import bcrypt from 'bcryptjs';

/**
 * Password hashing. bcryptjs is pure-JS (no native build) and cross-platform.
 * Cost factor 10 is a reasonable demo default; raise for production.
 * Async variants keep the event loop responsive under concurrent logins.
 */
const COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Sync variant for the seed loader (one-shot script, not a request path). */
export function hashPasswordSync(plain: string): string {
  return bcrypt.hashSync(plain, COST);
}

/** Minimal password strength policy for self-registration. */
export function isPasswordAcceptable(plain: string): boolean {
  return typeof plain === 'string' && plain.length >= 8 && plain.length <= 200;
}
