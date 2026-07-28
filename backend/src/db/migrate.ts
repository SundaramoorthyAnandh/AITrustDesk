import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getDb, getSqlite } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../../drizzle');

/**
 * Apply all generated Drizzle migrations to the configured database.
 * Idempotent: drizzle records applied migrations in __drizzle_migrations and
 * skips those already present. Safe to run before every load/eval.
 */
export function runMigrations(): void {
  const db = getDb();
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

// Allow `tsx src/db/migrate.ts` to run standalone.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  try {
    runMigrations();
    getSqlite().close();
    // eslint-disable-next-line no-console
    console.log('✅ Migrations applied.');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}
