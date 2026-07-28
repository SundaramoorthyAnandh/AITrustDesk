import { randomUUID, createHash } from 'node:crypto';

/** UUID v4 for system-generated primary keys. */
export function newId(): string {
  return randomUUID();
}

/** Prefixed id for human-facing entities created at runtime (e.g. TCK-<uuid>). */
export function prefixedId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** Stable SHA-256 hex — used to store refresh tokens without the raw value. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/* ───────────────────────── Deterministic UUIDs (RFC 4122 v5) ───────────────────────── */

// Fixed namespace so the same logical key always maps to the same UUID across
// loader runs — keeps seeding idempotent while producing real UUIDs.
const SEED_NAMESPACE = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}
function bytesToUuid(b: Buffer): string {
  const h = b.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** RFC-4122 v5 UUID (SHA-1, name-based) — deterministic for a given name. */
export function uuidV5(name: string, namespace: string = SEED_NAMESPACE): string {
  const hash = createHash('sha1')
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(name, 'utf8')]))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC-4122 variant
  return bytesToUuid(bytes);
}

/**
 * Map a readable seed key ("CUST-1001", "ORD-5001", "TCK-9001") to a stable,
 * type-prefixed UUID ("CUST-<uuid>"). Used only by the loader so the seed JSON
 * can keep readable cross-references while the DB stores UUIDs.
 */
export function seedId(logicalKey: string): string {
  const prefix = logicalKey.split('-')[0] ?? 'ID';
  return `${prefix}-${uuidV5(logicalKey)}`;
}
