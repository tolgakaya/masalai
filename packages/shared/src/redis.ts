/**
 * BullMQ/ioredis connection options derived from a REDIS_URL.
 *
 * `family: 0` is MANDATORY on Railway's IPv6-only private network
 * (railway-deployment.md §5.3, gotcha #3): ioredis defaults to IPv4 and would
 * fail to resolve the private domain (ETIMEDOUT/ENOTFOUND). Encoded here — in
 * @masalai/shared, not per-app — so every consumer (api producer, worker
 * consumer) inherits the fix. `family: 0` is also safe locally (dual-stack).
 */
export interface RedisConnectionOptions {
  readonly host: string;
  readonly port: number;
  /** 0 = resolve both IPv4 and IPv6 (required on Railway private net). */
  readonly family: 0;
  readonly password?: string;
}

export function buildRedisConnection(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    family: 0,
    ...(url.password ? { password: url.password } : {}),
  };
}
