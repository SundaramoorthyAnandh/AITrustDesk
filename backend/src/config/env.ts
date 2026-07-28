import { z } from 'zod';

/**
 * Central, validated environment. Fail fast at boot if misconfigured.
 * Everything downstream imports `env` — never reads process.env directly.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().default('./trustdesk.db'),
  // Reseed on every boot — used on ephemeral hosts (e.g. Render free tier) so a
  // fresh disk after a cold start / redeploy always has the full seed data.
  SEED_ON_BOOT: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Auth
  CUSTOMER_JWT_SECRET: z.string().min(1).default('dev-customer-secret-change-me'),
  AGENT_JWT_SECRET: z.string().min(1).default('dev-agent-secret-change-me'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(1_209_600),
  SEED_DEFAULT_PASSWORD: z.string().min(1).default('Password123!'),

  // LLM
  LLM_PROVIDER: z.enum(['mock', 'langchain']).default('mock'),
  OPENAI_BASE_URL: z.string().default('http://localhost:1234/v1'),
  OPENAI_API_KEY: z.string().default('lm-studio'),
  MODEL_NAME: z.string().default('local-model'),
  LLM_TEMPERATURE: z.coerce.number().default(0),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
