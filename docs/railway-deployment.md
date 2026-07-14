# MasalAI — Railway Deployment Architecture
### Monorepo → Railway: Dockerfiles, Service Configuration, Environments

> Eighth document of the set (`docs/railway-deployment.md`). **Normative** for `infra/railway/**`, the S0b staging-deploy session (kickoff C2), and every deploy-touching change after it. Handbook §5.3 defers to this document for Railway mechanics.
>
> **Reference:** `docs/reference/RAILWAY_DEPLOYMENT_ARCHITECTURE.md` (ZiraAI, 2026-07-14) — a production-verified Railway monorepo deployment. We adopt its canonical monorepo solution (its §2.2 "Approach A"), its multi-stage Docker discipline, private-networking preference, watch-paths and gotcha catalog — translated from .NET/npm to pnpm+Turborepo. We deliberately do NOT inherit its documented tech debt (Dockerfile zoo, three competing monorepo strategies, NIXPACKS/DOCKERFILE mixing) or its §12 security incident (committed `.env.railway.*` secrets).

---

## 1. Topology

One Railway **project**, two **environments** (`staging`, `production`), three **services** built from the single GitHub repo, plus managed plugins:

| Service | Source | Dockerfile | Health | Scaling |
|---|---|---|---|---|
| `web` | repo root context | `infra/railway/Dockerfile.web` | `GET /api/health` | replicas (rare) |
| `api` | repo root context | `infra/railway/Dockerfile.api` | `GET /health` | replicas |
| `worker` | repo root context | `infra/railway/Dockerfile.worker` | container HEALTHCHECK only (no HTTP — background consumer, reference §5 pattern) | replicas = primary scaling lever (scale-doc §8) |
| Postgres, Redis | Railway plugins | — | managed | vertical |

Build: **DOCKERFILE builder everywhere** — never Nixpacks, never mixed (the reference's §5 inconsistency note, adopted as a hard rule). Deploy: GitHub push → CI green → auto-deploy to staging; production = manual promote (plan §17 / handbook §5.3).

---

## 2. The Monorepo Solution (reference §2.2 "Approach A", pnpm edition)

**Problem (identical class to the reference's `Core.csproj not found`):** `apps/api` depends on `packages/shared|db|providers`. If a service's Root Directory is set to `apps/api`, the build context excludes `packages/**` → `COPY packages/shared ...` fails.

**Canonical solution — per service, in Railway dashboard:**
1. **Settings → Root Directory: EMPTY** (build context = repo root; this is what grants access to `packages/**`).
2. **Variables → `RAILWAY_DOCKERFILE_PATH=infra/railway/Dockerfile.<service>`** — with 3 Dockerfiles in one repo, this also kills the reference's gotcha #11 (auto-detect picking the wrong one).
3. **Settings → Config file path: `infra/railway/railway.<service>.json`** — with empty root dirs, a single root `railway.json` would be shared by all three services; per-service config paths keep them independent (this replaces the reference's per-subfolder `railway.json` placement, which our empty-root setup can't use).
4. **Watch paths** (prevent needless rebuilds; reference §6.4 translated):
   - web: `apps/web/**, packages/ui/**, packages/shared/**, infra/railway/Dockerfile.web`
   - api: `apps/api/**, packages/shared/**, packages/db/**, infra/railway/Dockerfile.api`
   - worker: `apps/worker/**, packages/shared/**, packages/db/**, packages/providers/**, infra/railway/Dockerfile.worker`
   - All three also watch `pnpm-lock.yaml, pnpm-workspace.yaml, turbo.json`.

**One Dockerfile per service, exactly three, forever** — the reference honestly calls its own 11-Dockerfile inventory a "zoo/teknik borç"; we start clean and a 4th Dockerfile in review is a reject.

---

## 3. Canonical Dockerfile (pnpm + Turborepo, translating reference §3.2/§3.5)
The reference's layer-cache insight (".csproj-only COPY → restore → full COPY") maps to `turbo prune --docker`'s two-phase output: lockfile+package.jsons first (cached install layer), sources second. Its Node pattern's alpine / `--omit=dev` / non-root / HEALTHCHECK habits are all kept.

`infra/railway/Dockerfile.api` (worker is identical with `@masalai/worker` + no EXPOSE; web differs per §3.1):
```dockerfile
FROM node:22-alpine AS base
RUN corepack enable

# 1) prune: workspace'i servisin gerçek bağımlılıklarına indir
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2 prune @masalai/api --docker

# 2) install: SADECE manifest'ler → bu layer kaynak değişiminde cache'ten gelir
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
# 3) build: kaynaklar sonra gelir (reference §2.2'deki COPY sıralaması ilkesi)
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo build --filter=@masalai/api
# 4) prod-prune: dev bağımlılıklarından arınmış, taşınabilir çıktı
RUN pnpm deploy --filter=@masalai/api --prod /out

# 5) runner: küçük, non-root, sağlık kontrollü (reference §3.5 güvenlik seti)
FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup -S app && adduser -S app
COPY --from=builder /out .
USER app
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-8080}/health || exit 1
CMD ["node", "dist/index.js"]
```

### 3.1 Web (Next.js) deltas
`next.config.ts` → `output: 'standalone'`; runner copies `.next/standalone`, `.next/static`, `public`; `CMD ["node","apps/web/server.js"]`. Same prune/install/build stages.

### 3.2 Port & binding (reference §9 PORT note, inverted for Node)
Railway injects `PORT`. Unlike the reference's fixed-8080 .NET stance, our services **must** honor it: Fastify/Next listen on `0.0.0.0:${PORT ?? 8080}` — `env.ts` treats `PORT` as optional-with-default, and nothing else hardcodes ports.

### 3.3 `.dockerignore` (root, reference §3.6)
`node_modules`, `**/dist`, `.next`, `.git`, `.env*` (keep `!.env.example`), `docs`, `coverage`, `.turbo`. Small context, no secret can leak into an image.

---

## 4. railway config-as-code (per service, reference §5 template unified)
`infra/railway/railway.api.json`:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "infra/railway/Dockerfile.api" },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "preDeployCommand": "node apps/api/dist/scripts/migrate.js"
  }
}
```
- `web`: same, healthcheck `/api/health`, no preDeploy. `worker`: no healthcheckPath (reference's background-consumer pattern), no preDeploy.
- **Migrations (our delta from the reference):** the reference runs EF migrations *manually* (its §9). We keep handbook §5.3: `prisma migrate deploy` as the api service's **pre-deploy command** — automated, expand→contract-safe, and the deploy fails loudly if migration fails. Never `db push`.
- Deploy order within a release: api (carries migration) → worker → web. Worker graceful shutdown (SIGTERM → `worker.close()` 120 s) already mandated by handbook §5.3/scale-doc §8.

---

## 5. Environments, Variables & Networking

### 5.1 Layering (reference §4 three-layer model, simplified for Node)
Only two layers exist for us: code defaults in `env.ts` (zod, non-secret defaults only) ← overridden by **Railway Variables** (the sole source of environment truth). No `appsettings`-style baked files, no `.env` in images.

### 5.2 Branch → environment
`main` → **staging**, auto-deploy ON, gated on CI green. **production** = manual promote of a staging-verified build (no direct branch→prod auto-deploy at this stage — tightens the reference's §4.1 mapping to our sprint reality).

### 5.3 Reference variables & private networking (reference §4.4/§7 — adopted, with the Node gotcha)
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` — Prisma consumes the URL format natively (the reference's .NET string-format conversion helper is unnecessary here; noted as a delta). Append `?connection_limit=<pool>` per handbook §7.
- `REDIS_URL=${{Redis.RAILWAY_PRIVATE_DOMAIN}}`-based private URL, SSL off on private net (reference §4.4 recommendation).
- ⚠️ **Railway private networking is IPv6-only** and ioredis resolves IPv4 by default → BullMQ/ioredis must connect with `family: 0` (or `?family=0` in the URL). This is our stack's equivalent of the reference's gotcha #5 (Redis "connection abort") — it WILL bite otherwise; encode it in the redis client factory in `packages/shared`, not in each app.
- DB/Redis stay private-network only; nothing stateful gets a public proxy unless a concrete need is recorded in DECISIONS.md.

### 5.4 Variable matrix (maps 1:1 to each app's `env.ts` — the reference's §8 matrix, ours)
| Service | Non-secret | Secret (🔑 sealed, dashboard-only) |
|---|---|---|
| all | `NODE_ENV`, `LOG_LEVEL`, `PORT` (injected), `APP_ENV=staging|production` | — |
| api | `WEB_ORIGIN`, `R2_BUCKET`, `R2_ENDPOINT` | 🔑 `DATABASE_URL`, `REDIS_URL`, `R2_ACCESS_KEY_ID/SECRET` (sign-scope), `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, MoR webhook secret |
| worker | `R2_BUCKET/ENDPOINT`, `CONCURRENCY_*` (scale-doc §8), `RL_*`/`BREAKER_*` (scale-doc §10), `PROVIDERS_REGISTRY` | 🔑 `DATABASE_URL`, `REDIS_URL`, R2 write-scope keys, provider API keys (≥1 image + 1 LLM + 1 TTS) |
| web | `NEXT_PUBLIC_*` only (nothing sensitive is ever `NEXT_PUBLIC_`) | 🔑 `BETTER_AUTH_SECRET` (if session verification at edge) |
Rule inherited from the reference's hardest lesson (§12): **secrets exist ONLY in Railway variables (sealed).** No `.env.railway.*` files, ever, anywhere — our gitleaks hook + CI enforce what their repo learned by committing live production passwords.

---

## 6. Deploy Verification (reference §10, sprint-fit)
Per deploy, evidence-based (protocol §6.2): `railway logs` clean on all three; `GET /health` (api) and `/api/health` (web) → 200; walking-skeleton curl round-trip on the environment with requestId visible in worker logs; queue draining (no growth at idle); one rollback rehearsal on staging during S0b (redeploy previous image — reference §9 rollback path) so the runbook is tested before it's needed.

## 7. Gotcha Catalog (reference §11, translated to this stack)
| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | Build: `packages/shared not found` | Root Directory set to app subfolder | Root Directory EMPTY + root-context Dockerfile (§2) |
| 2 | Wrong Dockerfile builds | Auto-detect among 3 Dockerfiles | `RAILWAY_DOCKERFILE_PATH` per service (§2) |
| 3 | Redis `ETIMEDOUT/ENOTFOUND` on private net | IPv6-only private network, ioredis defaults IPv4 | `family: 0` in shared redis factory (§5.3) |
| 4 | App unreachable / healthcheck fails | Listening on localhost or fixed port | Bind `0.0.0.0:${PORT}` (§3.2) |
| 5 | Healthcheck timeout on first deploy | Cold build + migration inside window | `healthcheckTimeout: 300`; preDeploy runs migration *before* start |
| 6 | `ERR_PNPM_OUTDATED_LOCKFILE` in image build | lockfile drift | `--frozen-lockfile` stays; fix lockfile in PR, never in Dockerfile |
| 7 | All services rebuild on any push | No watch paths | §2.4 watch paths incl. lockfile/turbo.json |
| 8 | Worker killed mid-story on deploy | No grace period | SIGTERM handler + Railway overlap (handbook §5.3) |
| 9 | Config change has no effect | Editing railway.json while dashboard overrides | Dashboard wins on conflict (reference §5 note) — keep dashboard minimal, config-as-code authoritative, reconcile in DECISIONS.md |
| 10 | Env var read as `undefined` at runtime | Missing in Railway for that environment | `env.ts` crashes at boot by design (handbook §9) — check the *environment*, staging/prod vars are separate |

## 8. Deltas from the reference (honest ledger)
| Reference (ZiraAI) | MasalAI | Why |
|---|---|---|
| Approach A: empty root + `RAILWAY_DOCKERFILE_PATH` | **Adopted verbatim**, + per-service config file paths | Same monorepo problem class |
| 11-Dockerfile zoo, 3 strategies coexisting | Exactly 3 Dockerfiles, one strategy, 4th = review reject | Its own "teknik borç" verdict |
| NIXPACKS/DOCKERFILE mixed configs | DOCKERFILE only, everywhere | Its §5 inconsistency warning |
| EF migrations manual via `railway run` | `prisma migrate deploy` as api preDeploy | Automated + expand→contract safe (handbook §5.6) |
| appsettings + Dockerfile ENV + Railway (3 layers) | env.ts defaults + Railway (2 layers) | Node has no baked-config need; fewer places for drift |
| Fixed 8080, PORT unused | `PORT` honored, 0.0.0.0 | Node/Railway idiom |
| `.env.railway.*` committed (its §12 incident) | Secrets sealed-only; gitleaks enforced | Learn from the documented wound |
| RabbitMQ/CloudAMQP plugin | Not provisioned (BullMQ on Redis, scale-doc ADR-0006) | One less stateful service |
| Kept as-is | multi-stage/non-root/alpine, watch paths, private networking, reference variables, ON_FAILURE restart, healthcheck discipline, rollback path | Proven — don't reinvent |
