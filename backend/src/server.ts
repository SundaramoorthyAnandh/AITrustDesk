import { buildApp } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { getSqlite } from './db/client.js';
import { loadAll } from './loaders/load.js';
import { rebuildRetriever } from './container.js';

/**
 * Production/dev entrypoint. Applies migrations, then starts listening.
 * Data is normally loaded separately via `npm run load` (idempotent). On
 * ephemeral hosts set SEED_ON_BOOT=true so a fresh disk is seeded automatically.
 */
async function main(): Promise<void> {
  runMigrations();

  if (env.SEED_ON_BOOT) {
    loadAll(); // idempotent — safe to run on every boot
    rebuildRetriever();
    // eslint-disable-next-line no-console
    console.log('🌱 Seed data loaded on boot (SEED_ON_BOOT=true).');
  }

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down…`);
    await app.close();
    try {
      getSqlite().close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
