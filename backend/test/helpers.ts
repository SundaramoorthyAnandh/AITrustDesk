import { runMigrations } from '../src/db/migrate.js';
import { loadAll } from '../src/loaders/load.js';
import { rebuildRetriever, setProvider } from '../src/container.js';
import { MockProvider } from '../src/llm/mock.provider.js';

/**
 * Initialise the isolated in-memory DB for a test file:
 * migrate → seed (idempotent) → rebuild retriever → force MockProvider.
 * DATABASE_URL=':memory:' is set by vitest.config.ts, and Vitest isolates
 * modules per test file, so each file gets its own fresh database.
 */
let initialised = false;
export function initTestDb(): void {
  if (initialised) return;
  runMigrations();
  loadAll('2026-07-01T00:00:00.000Z');
  rebuildRetriever();
  setProvider(new MockProvider());
  initialised = true;
}
