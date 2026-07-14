# infra/railway — Railway deploy config

Normative doc: **`docs/railway-deployment.md`** (handbook §5.3 defers to it). These
files are the config-as-code half of S0b; the **dashboard setup below is Tolga's**.

## Files
- `Dockerfile.{api,worker,web}` — multi-stage (`turbo prune --docker` → install →
  build → `pnpm deploy --legacy --prod`), alpine, non-root, HEALTHCHECK. api/worker
  regenerate the Prisma client into the deployed bundle.
- `railway.{api,worker,web}.json` — builder + deploy config (api carries the
  migrate pre-deploy command).

All three images build **from the repo root context** and were verified locally
(`docker build` + walking-skeleton round-trip across the api/worker images).

## Dashboard setup (per service — railway-deployment.md §2)
For each of `web`, `api`, `worker`:
1. **Settings → Root Directory: EMPTY** (build context = repo root).
2. **Variables → `RAILWAY_DOCKERFILE_PATH=infra/railway/Dockerfile.<service>`**
3. **Settings → Config file path: `infra/railway/railway.<service>.json`**
4. **Watch paths:**
   - web: `apps/web/**, packages/ui/**, packages/shared/**, infra/railway/Dockerfile.web`
   - api: `apps/api/**, packages/shared/**, packages/db/**, infra/railway/Dockerfile.api`
   - worker: `apps/worker/**, packages/shared/**, packages/db/**, packages/providers/**, infra/railway/Dockerfile.worker`
   - all three also: `pnpm-lock.yaml, pnpm-workspace.yaml, turbo.json`

`main` → staging (auto-deploy on CI green); production = manual promote (§5.2).

## Variables to set (per environment; secrets sealed — never committed) — §5.4
| Service | Non-secret | Secret 🔑 (dashboard-only) |
|---|---|---|
| all | `NODE_ENV`, `LOG_LEVEL`, `PORT` (injected), `APP_ENV=staging\|production` | — |
| api | `WEB_ORIGIN`, `R2_BUCKET`, `R2_ENDPOINT` | `DATABASE_URL`, `REDIS_URL`, `R2_ACCESS_KEY_ID/SECRET`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, MoR webhook secret |
| worker | `R2_BUCKET/ENDPOINT`, `CONCURRENCY_*`, `RL_*`/`BREAKER_*`, `PROVIDERS_REGISTRY` | `DATABASE_URL`, `REDIS_URL`, R2 write-scope keys, provider API keys (≥1 image + 1 LLM + 1 TTS) |
| web | `NEXT_PUBLIC_*` only | `BETTER_AUTH_SECRET` (if edge session verification) |

- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (+ `?connection_limit=<pool>`).
- `REDIS_URL` = private-domain URL; the shared redis factory forces `family: 0`
  (Railway private net is IPv6-only — §5.3).
- DB/Redis stay private-network only; no public proxy without a DECISIONS entry.
