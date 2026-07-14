# @masalai/api

Fastify 5 HTTP API with the zod type provider (schemas are the runtime contract
on both request and response). S0 scope is the walking-skeleton spine only.

## Routes

- `GET /health` — liveness probe.
- `POST /internal/health-job` — mint an id + `requestId`, enqueue a
  `health.job` payload (BullMQ), return `202 { id }`.
- `GET /internal/health-job/:id` — read the row the worker wrote (`200` view or
  `404 NOT_FOUND`).

`requestId` (inbound `x-request-id` or generated) is carried api → queue →
worker so an async round-trip is traceable end to end.

## Run

```bash
pnpm infra:up                      # Postgres + Redis
pnpm --filter @masalai/api dev     # tsx watch on API_PORT (default 3001)
```

Env (validated by `src/env.ts`, see root `.env.example`): `DATABASE_URL`,
`REDIS_URL`, `API_HOST`, `API_PORT`, `NODE_ENV`.
