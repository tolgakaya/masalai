# STATE — updated 2026-07-14 (session: chore/1-s0-bootstrap · S0a morning, Block 2 done)

> Multi-stream format (protocol §12 rule 2). During S0 a single session writes the **S0** block below;
> streams A/B/C activate Day 2. On conflict, git + this file win over Serena memory / /sc:save.

## INTEGRATION (owned by integrator — Tolga)
- Milestone: **M0 / S0** — bootstrap. Repo: github.com/tolgakaya/masalai (private).
- Bootstrap exception used once: `docs:` commit direct to main (c8994e5). Branch protection goes ON after PR #1 merges (handbook §4.5).
- Pending merges: PR #1 (chore/1-s0-bootstrap, S0a) — draft.
- Contract PRs in flight: none.
- Next merge window: end of S0a; Day-2 windows ~13:00 + EOD (protocol §12 rule 4).

## S0 block (active this session)
### Milestone: M0 · S0a (skeleton + protocol infra) — CODE COMPLETE (audit 9/9 ✅); remaining = push + PR #1 + /end
Issue #1 — Day 1 S0 bootstrap
Branch: chore/1-s0-bootstrap   PR: (draft, opens at session end)
Done (Block 1):
  - protocol state files + root CLAUDE.md (adca42b)
  - .claude/commands (7) + settings.json + hooks (d82e351)
  - monorepo root: pnpm/turbo/tsconfig.base/biome/.gitignore/.gitattributes (ca71688)
Done (Block 2) — packages/shared @masalai/shared, green (typecheck+build+lint ok, 10/10 vitest):
  - health-job.ts: healthJobPayloadSchema (zod strictObject, v/id/requestId/enqueuedAt) — api→queue→worker contract (m0-kickoff §7)
  - errors.ts: ErrorCode closed union + DomainError + hand-rolled Result/ok/err/isOk/isErr (handbook §6.2)
  - constants.ts: HEALTH_JOB_QUEUE='health.job', HEALTH_JOB_PAYLOAD_VERSION=1 (§5.6/§6.5) · index.ts barrel · README
  - deps: zod 4.4.3, vitest 3.2.7 (per DECISIONS); tsconfig(typecheck)+tsconfig.build(excl tests)
Done (Block 2b) — local dev infra, all 4 services booted healthy (docker compose ps verified):
  - docker-compose.dev.yml: postgres:16-alpine, redis:7-alpine, minio (S3 stand-in :9000/:9001), axllent/mailpit (:1025/:8025) — handbook §306
  - .env.example: DATABASE_URL/REDIS_URL/S3_*/SMTP_*/PROVIDERS=mock (dev-only throwaways; apps' env.ts wire these later, same PR)
  - root scripts: infra:up / infra:down / infra:logs
  - watch: minio/mailpit on :latest (comment: pin RELEASE.*/vX.Y before CI depends). Stack left RUNNING for next step.
Done (Block 3a) — packages/db @masalai/db scaffold + async-spine table, green (build+typecheck+lint+test):
  - prisma/schema.prisma: HealthJob model (health_jobs, uuid id, request_id, enqueued_at/processed_at timestamptz) — spine only, NOT domain
  - first migration 20260714105329_init_health_job applied to local pg; SQL verified (\d health_jobs matches)
  - src/client.ts (internal PrismaClient singleton), repositories/health-job.repository.ts (upsert=idempotent + findById), index.ts barrel, README
  - deps: @prisma/client + prisma 6.19.3, @masalai/shared workspace:*; pnpm onlyBuiltDependencies allowlist added (Prisma engines)
  - DECISIONS: prisma-client-js classic generator; pnpm onlyBuiltDependencies (both 2026-07-14)
Done (Block 3b) — full plan §4.5 domain schema, green (build+typecheck+lint+test); Tolga-specified enums baked in:
  - migration 20260714110805_domain_model_v1 applied; 12 tables + 10 enum types verified in pg
  - enums: CharacterType/Status, StoryStatus, JobStage/Status, ModerationStatus, AssetKind, CreditReason, SubscriptionPlan/Status; art_style/locale/language = String (app-registry)
  - story_characters join (M:N, position, cascade FKs) added to schema AND docs/plan.md §4.5 (Doc-Touch)
  - repos userId-first, IDOR-safe (findFirst{id,userId}): character/story/asset + health-job; index re-exports enums(values)+model types
  - 4 DECISIONS entries logged (enum policy, value sets, story_characters, audit_log nullable). No QUESTIONS were opened (option B).
Done (Block 4) — apps/api (Fastify 5 + zod type provider) + apps/worker (BullMQ 5): the walking skeleton, GREEN end-to-end:
  - api: env.ts (zod, fail-fast), GET /health, POST /internal/health-job (enqueue, deterministic jobId=idempotent), GET /internal/health-job/:id (reads via db repo); genReqId accepts x-request-id
  - worker: BullMQ consumer parses payload (shared contract) → upsertHealthJob (idempotent) → pino log w/ requestId; graceful shutdown (SIGTERM drains)
  - EXIT EVIDENCE (freshly run): POST x-request-id=demo-req-42 → worker "health-job processed" → GET returns requestId=demo-req-42 → pg row present. requestId propagated api→queue→worker→db. (m0-kickoff §7 ✓)
  - .env.example += API_HOST/API_PORT; build+typecheck+lint all green (shared 10/10 vitest)
  - CAVEAT: manual round-trip proven; automated integration test (testcontainers, handbook §7) NOT yet written — deferred to CI block
Done (Block 5) — monorepo complete (7 projects) + pnpm check GREEN end-to-end (17/17 turbo tasks + depcruise 0 violations):
  - apps/web: Next 16 App Router placeholder (src/app/layout+page), next.config, per-pkg turbo.json (typecheck dependsOn build for .next/types)
  - packages/ui: placeholder index (UI_PACKAGE_NAME), no tokens (Stream C)
  - packages/providers: adapter interfaces (Text/Image/TTS/Moderation) — vendor SDKs contained here (§3.1)
  - .dependency-cruiser.cjs: no-circular, shared-leaf, ui-presentational, packages≠apps, apps-isolated, vendor-sdk-containment → depcruise 33 modules 0 violations
Done (Block 6) — closed the audit's 3 remaining gaps:
  - CI (#5): .github/workflows/pr.yml (check+build+audit), main.yml, nightly.yml stub; PR template + ISSUE_TEMPLATE/task.yml; lefthook real hooks (biome+gitleaks pre-commit, conventional commit-msg via scripts/check-commit-msg.mjs — both verified live); gh labels (prio/stream/area/type)
  - ADRs (#6): docs/adr/0001-fastify · 0002-better-auth · 0003-prisma · 0004-biome (plan §8.4)
  - Day-2 issues (#8): gh #2 Stream A (worker+providers, incl ai-provider-scale-architecture.md ptr) · #3 Stream B (api+db) · #4 Stream C (web+ui) — all DoR-complete (goal/acceptance/context)
S0a AUDIT: 9/9 ✅ (fresh evidence). pnpm check GREEN (17/17 + depcruise 0 violations). Walking skeleton re-verified live.
Done (Railway doc adoption) — docs/railway-deployment.md now normative (handbook §5.3 defers):
  - Doc-Touch row added (deploy/infra → railway-deployment.md + §5.3); m0-kickoff C2 step-1 = read that doc
  - Reconciled existing code: REDIS_URL → shared buildRedisConnection() with family:0 (Railway IPv6 gotcha #3); api honors injected PORT + binds 0.0.0.0 (was API_HOST/API_PORT). Walking skeleton re-verified green.
  - PENDING for S0b (no infra/railway files exist yet): 3 Dockerfiles (turbo prune --docker, DOCKERFILE builder), railway.<svc>.json (api preDeploy=migrate), .dockerignore §3.3
NOW:  push chore/1-s0-bootstrap → open PR #1 (paste migration SQL from f0358e5/20421d1 in body) — NEEDS Tolga's go (first push, outward-facing)
Then: /end ritual → /sc:save. Day-1 afternoon = S0b staging deploy (issue #5, separate session per m0-kickoff C2).
Reminder: dev infra (pnpm infra:up) RUNNING; api/worker stopped after evidence.
Watch out: pin baseline majors, not npm-latest (DECISIONS 2026-07-14, handbook §2.2); @masalai/* package naming

### Next steps after Block 2
Block 3: dependency-cruiser → CI → ADR 0001-0004 → Day-2 issues #2/#3/#4 → PR

### Blockers / waiting on Tolga
None blocking. Human-track (parallel, not agent): MoR account, domain/DNS, legal-text review (kickoff §A.4).

## Stream A — apps/worker + packages/providers  (activates Day 2, issue #2)
_dormant until Day 2_

## Stream B — apps/api + packages/db  (activates Day 2, issue #3)
_dormant until Day 2_

## Stream C — apps/web + packages/ui  (activates Day 2, issue #4)
_dormant until Day 2_
