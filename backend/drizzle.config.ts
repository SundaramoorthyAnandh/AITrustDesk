import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration.
 * `npm run db:generate` emits SQL migrations to ./drizzle from src/db/schema.ts.
 * They are applied by src/db/migrate.ts (used by `npm run db:migrate`, and
 * automatically before `npm run load` / `npm run eval`).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './trustdesk.db',
  },
  strict: true,
  verbose: true,
});
