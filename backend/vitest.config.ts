import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Each test file gets an isolated in-memory DB; run serially-safe.
    pool: 'threads',
    env: {
      NODE_ENV: 'test',
      LLM_PROVIDER: 'mock',
      DATABASE_URL: ':memory:',
      CUSTOMER_JWT_SECRET: 'test-customer-secret',
      AGENT_JWT_SECRET: 'test-agent-secret',
      SEED_DEFAULT_PASSWORD: 'Password123!',
    },
  },
});
