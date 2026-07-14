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
### Milestone: M0 · S0a (skeleton + protocol infra) — in progress (Block 3a done)
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
NOW:  Block 3b · step — packages/db: full plan §4.5 domain schema (users/characters/assets/stories/story_pages/jobs/credits_ledger/subscriptions/audit_log) as 2nd migration + userId-first repo skeletons (handbook §7)
  - §4.5 only enumerates values for assets.kind + credits_ledger.reason → use Prisma enums there; other status/type/style fields = String v1 (record DECISION + QUESTIONS, don't guess)
Then: apps/api → apps/worker → apps/web+ui+providers → walking-skeleton integration test
Reminder: dev infra stack (pnpm infra:up) is RUNNING — postgres has health_jobs + _prisma_migrations.
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
