import { z } from 'zod';

/** Validated process environment. Fail fast on boot rather than crash mid-request. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Railway injects PORT per-service; treat as optional-with-default and always
  // bind 0.0.0.0 (railway-deployment.md §3.2). Local default 8080.
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment for @masalai/api:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
