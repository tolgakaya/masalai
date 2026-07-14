# @masalai/worker

BullMQ 5 consumer. S0 scope is the walking-skeleton consumer only: it reads
`health.job` payloads, validates them against the shared contract, and writes a
`health_jobs` row via `@masalai/db` (idempotent upsert, so retries are safe).

The story pipeline stages (`plan|illustrate|narrate|assemble`) land in Stream A
(Day 2, issue #2).

## Run

```bash
pnpm infra:up                        # Postgres + Redis
pnpm --filter @masalai/worker dev    # tsx watch
```

Env (validated by `src/env.ts`, see root `.env.example`): `DATABASE_URL`,
`REDIS_URL`, `NODE_ENV`. Graceful shutdown on SIGINT/SIGTERM drains in-flight
jobs before exit (handbook §5.3).
