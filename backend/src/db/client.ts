import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { env } from '../config/env.js';
import * as schema from './schema.js';

/**
 * Single shared better-sqlite3 connection.
 *
 * PRAGMAs chosen for correctness + concurrency on a single-node store:
 *  - WAL: readers never block the single writer (keeps ticket reads responsive
 *    while an AI/eval job writes — satisfies the "don't block" rule at the DB tier).
 *  - foreign_keys ON: referential integrity is enforced.
 *  - busy_timeout: brief contention waits instead of immediate SQLITE_BUSY.
 */
export type DB = BetterSQLite3Database<typeof schema>;

let _sqlite: Database.Database | null = null;
let _db: DB | null = null;

function createConnection(url: string): Database.Database {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  return sqlite;
}

export function getSqlite(): Database.Database {
  if (!_sqlite) _sqlite = createConnection(env.DATABASE_URL);
  return _sqlite;
}

export function getDb(): DB {
  if (!_db) _db = drizzle(getSqlite(), { schema });
  return _db;
}

/**
 * Build an isolated in-memory DB (used by tests). Returns both handles so a test
 * can run migrations against it and dispose cleanly.
 */
export function createInMemoryDb(): { db: DB; sqlite: Database.Database } {
  const sqlite = createConnection(':memory:');
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export { schema };
