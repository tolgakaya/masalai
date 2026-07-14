# MasalAI — Engineering Handbook
### Development Principles, Standards & Delivery Process

> Companion to `docs/plan.md` (product/architecture/business). This document is the **how we build** contract: stack versions, repository rules, Git/PR workflow, CI/CD, coding standards, and working agreements. It is written to be enforced — every rule here is either automated (CI/branch protection/lint) or on the PR checklist. Claude Code must treat this document as binding; CLAUDE.md references it.

---

## 1. Engineering Principles

1. **Trunk-based, always deployable.** `main` deploys to production automatically. If it's on `main`, it's live (or behind a flag). There is no `develop` branch, no release branches, no long-lived feature branches.
2. **Small batches.** PRs ≤ ~400 changed lines (excluding lockfiles/generated code). Big features ship as a sequence of small PRs behind a feature flag, not one mega-PR.
3. **Contracts first.** Every boundary (API, queue payload, provider adapter, analytics event) is a zod schema in `packages/shared` before implementation. Types are derived from schemas, never hand-written twice.
4. **Boring by default.** Choose the most-documented mainstream option unless there's a written ADR justifying otherwise. Novelty budget is spent on the product (story/illustration quality), never on infrastructure.
5. **Automate the standard.** A rule that isn't enforced by a tool (CI check, lint rule, branch protection, pre-commit hook) will decay. Prefer deleting a rule over keeping it manual.
6. **Idempotent everything.** Jobs, webhooks, migrations, deploy scripts — safe to run twice. This is non-negotiable in an async pipeline product.
7. **Cost and privacy are code review concerns.** A PR that adds a provider call must show its per-story cost impact; a PR that touches user assets must show its privacy impact. Both are checklist items.
8. **Optimize for the AI pair.** The repo is built to be legible to Claude Code: strict types, colocated tests, small files, exhaustive `pnpm check`, self-describing errors. Human ergonomics and agent ergonomics turn out to be the same thing.

---

## 2. Technology Stack & Version Policy

### 2.1 Baseline versions (verified July 2026 — re-verify with the command column at init)
| Layer | Choice | Baseline | Verify |
|---|---|---|---|
| Runtime | Node.js | **22 LTS** (24 LTS acceptable; pick one, pin in `.nvmrc` + `engines`) | `node --version` |
| Language | TypeScript | 5.x latest stable, `strict: true` | `npm show typescript version` |
| Package manager | pnpm | 10.x, pinned via `packageManager` field (Corepack) | `npm show pnpm version` |
| Monorepo | Turborepo | 2.x | `npm show turbo version` |
| Web | Next.js | **16.x** (App Router; Turbopack is default bundler; note: `middleware.ts` is now `proxy.ts`) + React 19.x | `npm show next version` |
| Styling | Tailwind CSS 4 + shadcn/ui | 4.x | `npm show tailwindcss version` |
| API | Fastify | 5.x + `fastify-type-provider-zod` | `npm show fastify version` |
| Validation | zod | 4.x | `npm show zod version` |
| ORM | Prisma | 6.x+ (see ADR-003 for Prisma-vs-Drizzle rationale) | `npm show prisma version` |
| Queue | BullMQ | 5.x + Redis 7 | `npm show bullmq version` |
| Auth | Better Auth | latest stable | — |
| Lint/format | **Biome** (single tool, replaces ESLint+Prettier) | 2.x | `npm show @biomejs/biome version` |
| Tests | Vitest 3.x, Playwright latest, k6 | — | — |
| Logging | pino | 9.x | — |
| Email | react-email + Resend | — | — |
| Errors | Sentry SDK | latest | — |

### 2.2 Version policy
- **Pin exact versions** in `package.json` (no `^`/`~`) for anything touching money, auth, or the pipeline; caret allowed for pure dev tooling. `pnpm-lock.yaml` always committed; CI uses `--frozen-lockfile`.
- **Renovate bot** (preferred over Dependabot for monorepos): weekly batch PR for minors/patches, individual PRs for majors, automerge only for dev-deps with green CI. Security advisories: immediate PR, same-day merge target.
- The already-decided rows of this table (Fastify, Better Auth, Prisma, Biome) are recorded as **ADR-0001..0004 during M0** so the rationale survives outside this table (plan §8.4 is the status ledger).
- **Framework majors** (Next, Prisma, BullMQ): upgrade within 1–2 minor cycles of stable, never day-one; each major upgrade is its own PR with the official codemod applied (`npx @next/codemod@latest upgrade`) and a full E2E pass. Security patches to the current major: within 48 h (Next.js ships coordinated security releases — subscribe to the GitHub security advisories for `vercel/next.js`, `prisma`, `fastify`).
- One `engines` + `.nvmrc` + Dockerfile base image = same Node version everywhere. Drift between local/CI/Railway is a build failure, not a warning.

### 2.3 Explicit non-choices (write once, stop relitigating)
- No Kubernetes/EKS until Railway demonstrably limits us (you know EKS; that's the escape hatch, not the start).
- No microservices beyond web/api/worker. No GraphQL. No Kafka/NATS (BullMQ suffices below ~10⁵ jobs/day). No CSS-in-JS. No Redux (server state via TanStack Query, local state via React state/zustand if needed).

---

## 3. Repository Architecture Rules

### 3.1 Package dependency direction (enforced)
```
apps/web ────┬──▶ packages/ui ──▶ packages/shared ◀── packages/db
apps/api ────┤                          ▲
apps/worker ─┴──▶ packages/providers ───┘
```
- `packages/shared`: zod schemas, derived types, constants, error codes, analytics events. **Depends on nothing internal.**
- `packages/ui`: design tokens (`tokens.css`) + component library per docs/ux-design-plan.md §4/§7. Imported by `apps/web` only; may import `shared` for types. No data fetching, no business logic — presentational contract only.
- `packages/db`: Prisma schema + client + repository helpers. May import `shared`.
- `packages/providers`: adapter interfaces + vendor implementations. May import `shared`. Vendor SDKs appear ONLY here — a lint rule (Biome `noRestrictedImports` / dependency-cruiser in CI) blocks `openai`, `@anthropic-ai/sdk`, `elevenlabs`, etc. anywhere else.
- Apps may import packages; packages never import apps; apps never import each other. Enforced by dependency-cruiser in CI.

### 3.2 Module conventions inside apps
- Feature-folder structure (`apps/api/src/modules/stories/{routes,service,schemas-ref,test}`), not layer-folders. A module owns its routes, service logic, and tests together.
- File size soft limit 300 lines; a file Claude Code can't hold in one view is a file that will rot.
- Public surface of a module = its `index.ts`; deep imports across modules are lint-blocked.
- Worker pipeline stages: one file per stage in `apps/worker/src/pipeline/{plan,illustrate,narrate,assemble}.ts`, each exporting a pure `run(input): Promise<output>` plus a thin BullMQ binding — the pure function is what gets unit-tested.

### 3.3 Generated code & assets
- Prisma client, OpenAPI JSON, react-email output: generated in CI/build, never hand-edited, gitignored where deterministic; `git diff --exit-code` check ensures schema→generated sync when committed.
- Style presets (`packages/providers/styles/*.json`) are versioned data, reviewed like code (they directly change COGS and output quality).

---

## 4. Git & GitHub Workflow

### 4.1 Model: trunk-based development
- Single protected `main`. Branch from `main`, PR back to `main`, delete branch on merge. Target branch lifetime **< 2 days**; if a branch lives longer, the task was sliced wrong.
- No direct pushes to `main` — not even the repo owner, not even "one-line fix". Branch protection makes this technical, not cultural.

### 4.2 Branch naming
```
<type>/<issue-id>-<short-slug>
feat/142-character-sheet-approval
fix/187-stripe-webhook-dedup
chore/deps-2026-07
docs/adr-image-provider
```
Types: `feat | fix | chore | docs | refactor | perf | test | ci | hotfix`.

### 4.3 Commits — Conventional Commits, enforced
```
<type>(<scope>): <imperative summary ≤ 72 chars>

<body: what & why, not how. Wrap at 100.>

Refs: #142
```
- Scopes = package/app names + cross-cutting ones: `web, api, worker, shared, db, providers, ci, infra, billing, pipeline`.
- `commitlint` runs in CI on PR title (see 4.4) — individual commit messages inside a PR are relaxed because we squash-merge, but the PR title MUST be a valid conventional commit; it becomes the `main` history.
- Breaking internal contract changes (queue payload, shared schema): `!` marker + `BREAKING:` footer describing the migration of in-flight jobs (see §5.6).

### 4.4 Pull requests
**Merge strategy: Squash and merge only.** Linear history on `main`; one commit = one PR = one revertable unit. Merge commits and rebase-merge disabled in repo settings.

**PR template** (`.github/pull_request_template.md`):
```md
## What & why
<!-- 2-5 lines. Link the issue: Closes #142 -->

## How to verify
<!-- exact steps or test names a reviewer runs -->

## Checklist
- [ ] `pnpm check` green locally
- [ ] Tests added/updated for new behavior
- [ ] No vendor SDK outside packages/providers
- [ ] DB migration follows expand→contract (or N/A)
- [ ] Cost impact: none / estimated $__/story (or N/A)
- [ ] Privacy impact: none / described below (or N/A)
- [ ] Screenshots for UI changes (or N/A)
- [ ] Feature-flagged if incomplete (or N/A)
```

**PR rules**
- ≤ 400 changed LOC (excl. lockfile/generated/snapshots). CI comments a warning above it; reviewer may bounce it.
- Draft PRs early and often; CI runs on drafts.
- Every PR links an issue. No issue → create one first (30 seconds) — the issue tracker is the project's memory.
- Review SLA: self-review pass first (read your own diff top to bottom — this catches 30% of issues), then Claude Code review pass (see §11.4), then merge. As a solo founder you are the human reviewer; the discipline is the diff-read, not the second human.
- Stacked PRs allowed for pipeline work (branch B from branch A); re-target B to `main` after A merges.

### 4.5 Branch protection settings for `main` (set these exactly, in repo Settings → Branches)
- Require a pull request before merging: ✔ (required approvals: 0 — solo; raise to 1 at first hire)
- Require status checks to pass: ✔ — required checks: `ci/typecheck`, `ci/lint`, `ci/test`, `ci/build`, `ci/depcruise`, `ci/security` (gitleaks + audit), `ci/idor-suite`
- Require branches to be up to date before merging: ✔ (with merge queue if PR volume grows)
- Require linear history: ✔ · Require signed commits: ✔ (set up SSH commit signing once)
- Block force pushes & deletions: ✔ · Do not allow bypassing the above settings: ✔ (include administrators)

### 4.6 Repo hygiene
- `CODEOWNERS`: `* @tolga` now; per-path entries (`/packages/db/ @tolga`) prepared so adding people later is a one-line change.
- Labels (created day one): `type:{feat,bug,chore,security}`, `area:{web,api,worker,pipeline,billing,infra}`, `prio:{p0,p1,p2}`, `good-claude-task` (well-specified issues ideal to hand to Claude Code), `needs-adr`.
- Issues use two forms: Bug (repro/expected/actual/logs) and Task (goal/acceptance criteria/out-of-scope). Acceptance criteria are written as testable statements — they become the test names.
- GitHub Projects board: single board, columns `Backlog → Ready → In progress → In review → Done`; milestones = M0–M4 from the plan. "Ready" means DoR met (§13).

---

## 5. CI/CD

### 5.1 Workflows (`.github/workflows/`)
| File | Trigger | Jobs |
|---|---|---|
| `pr.yml` | PR open/sync | changed-package detection (turbo) → typecheck, biome lint/format check, unit+integration (mocked providers), build all apps, depcruise, gitleaks, `pnpm audit --prod`, IDOR suite, PR-title commitlint, LOC-size comment |
| `main.yml` | push to `main` | full pipeline again (no skipping) → on green, Railway deploys fire (see 5.3); tag `deploy-YYYYMMDD-HHmm-<sha>` for traceability |
| `nightly.yml` | cron 03:00 TRT | live provider smoke tests (`RUN_LIVE=1`), LLM-judge regression suite (20 canonical stories), k6 light load, Renovate-adjacent `pnpm outdated` report, R2 backup verification job |
| `codeql.yml` | weekly + PR | CodeQL static analysis (free for public/private on GH Team) |

### 5.2 CI performance rules
- Turborepo remote cache (Vercel remote cache free tier or self-host `turbo` cache on R2) — target PR pipeline **< 6 min**; a slow pipeline silently kills the small-PR culture.
- `turbo run test --filter=...[origin/main]` — only affected packages run on PR; `main` runs everything.
- pnpm store cached via `actions/cache`; Playwright browsers cached; Docker layer cache for build jobs.
- Flaky test policy: a test that flakes twice gets quarantined the same day (`.skip` + issue with `prio:p1`) — red must always mean broken.

### 5.3 Deployment to Railway
- Each Railway service (web/api/worker) connects to the GitHub repo with **watch paths** (`apps/api/**, packages/**` for api, etc.) — only affected services redeploy on a `main` push.
- Deploy gating: Railway "wait for CI" enabled — services deploy only after `main.yml` is green (Railway check integration; if unavailable on plan, use `railway up` from the workflow's final job instead of auto-deploy).
- **Order & migrations**: api service pre-deploy command runs `pnpm --filter db exec prisma migrate deploy`. Deploy order within a release: db-migration (via api pre-deploy) → worker → api → web. Worker deploys use graceful shutdown: SIGTERM → stop taking jobs → finish in-flight (BullMQ `worker.close()` with 120 s grace) → exit; Railway healthcheck + overlap gives zero-downtime.
- **Staging environment** mirrors production (own DB/Redis/R2/Stripe-test); `main` auto-deploys to staging first, production promotion is a manual click (Railway environment promote) during M1–M3; after launch stability, flip to full auto with a canary checklist.
- **Rollback**: Railway instant redeploy of previous image (one click / `railway redeploy`). Because migrations are expand→contract (§5.6), the previous app version always runs against the new schema. Rollback runbook: redeploy previous → verify health → revert PR on `main` (never fix-forward under pressure unless the fix is a one-liner).
- PR preview environments (Railway PR envs) enabled for `web` only (cheap, high value for UI review); api/worker previews on demand.

### 5.4 Feature flags
- DB table `feature_flags(key, enabled, rollout_pct, allow_user_ids[])` + tiny helper in `shared`; cached 30 s in Redis. Flags let incomplete features merge to `main` (principle #1) and enable percentage rollouts (new image provider at 10%).
- Flag lifecycle rule: every flag has a removal issue created at birth; stale flags are debt.

### 5.5 Versioning & releases
- The app is continuously delivered; no semver for apps. `CHANGELOG.md` maintained per milestone from squash titles (`git log --oneline` between deploy tags; a small script formats it).
- `packages/*` are internal (workspace protocol), never published; no changesets needed.

### 5.6 Zero-downtime data & contract changes (the discipline that prevents 3 a.m. incidents)
- **DB — expand→migrate→contract**: (1) additive migration (new nullable column/table) ships alone; (2) code writes both/reads new ships next; (3) backfill job; (4) contract migration (drop old) ships ≥ 1 deploy later. Destructive DDL in the same PR as the code that requires it = review reject. `prisma migrate diff` output pasted into PR for any migration.
- **Queue payloads**: payloads carry `v` field; workers accept current and previous version for one release cycle (in-flight jobs survive deploys). Payload schema changes are `BREAKING:` commits.
- **API**: additive changes free; removals go through deprecation (log usage of deprecated field for a week → remove). Internal-only API keeps this lightweight but the habit matters.

---

## 6. Coding Standards

### 6.1 TypeScript configuration (root `tsconfig.base.json`)
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules` — all on. `any` is lint-banned (`noExplicitAny`); escape hatch is `unknown` + zod parse. `@ts-expect-error` requires a comment with issue link; `@ts-ignore` banned.

### 6.2 Lint & format: Biome
- One `biome.json` at root: recommended rules + `noRestrictedImports` (vendor SDK containment, cross-module deep imports), import sorting on. `pnpm format` writes; CI checks only.
- Biome replaces ESLint+Prettier for speed and single-tool simplicity; if a genuinely needed rule is missing, add targeted `eslint` for that rule only via an ADR (avoid tool sprawl by default).

### 6.3 Error handling doctrine
- **Expected failures are values, not exceptions**: services return `Result<T, DomainError>` (small hand-rolled type in `shared`, or `neverthrow`); route layer maps `DomainError` → HTTP.
- `DomainError` = `{ code: ErrorCode, message, meta? }`; `ErrorCode` is a closed union in `shared/errors.ts` (e.g. `MODERATION_REJECTED`, `INSUFFICIENT_CREDITS`, `PROVIDER_RATE_LIMITED`, `LIKENESS_BELOW_THRESHOLD`). Error codes are API contract: web switches on them for UX copy; they never change meaning.
- Exceptions are reserved for bugs/invariants — they crash the request, hit Sentry, return generic 500. Never `catch {}` silently; never catch to log-and-rethrow at multiple layers (catch once, at the boundary).
- API error envelope (all non-2xx): `{ error: { code, message, requestId } }`. Never leak stack traces, SQL, or provider error bodies to clients.

### 6.4 API conventions
- REST, plural nouns, kebab-case paths, camelCase JSON. Route handlers ≤ 30 lines: parse (zod type-provider) → call service → map result. Business logic lives in services, never route handlers.
- Pagination: cursor-based (`?cursor=&limit=`, max 100), response `{ items, nextCursor }`. Idempotency: mutation endpoints that create billable work accept `Idempotency-Key` header, dedup in Redis 24 h.
- Every request gets `requestId` (accept inbound `x-request-id` or generate); propagated into job payloads → worker logs → provider call logs. This single convention makes async debugging possible.
- OpenAPI spec auto-generated from Fastify+zod schemas, served at `/docs` in staging only.

### 6.5 Logging & observability conventions
- pino, JSON only, no `console.log` (lint-banned outside scripts). Base fields: `service, env, requestId, userId?, storyId?, jobId?, stage?`.
- Levels: `error` = pager-worthy defect, `warn` = degraded-but-handled (provider retry), `info` = business events (story_submitted, stage_completed with duration & cost), `debug` = local only.
- **Never log**: photo/signed URLs, tokens/keys, full prompts containing child names (log prompt hashes + template ids), email addresses (log userId). A gitleaks-style CI grep also scans for accidental `console.log` and secret-shaped strings in code.
- Metric naming: `masalai_<domain>_<thing>_<unit>` (`masalai_pipeline_stage_duration_seconds`, `masalai_provider_cost_usd_total`). Provider spend is a first-class counter.

### 6.6 Frontend standards (web)
- Server Components by default; `"use client"` only for interactivity (player, forms). Data fetching in RSC or route handlers; client fetches via TanStack Query with the shared zod schemas parsing responses (runtime-validated API contract on both sides).
- All user-facing strings through next-intl message catalogs from day one (TR default, EN second) — retrofitting i18n is 10× the cost.
- Forms: react-hook-form + zod resolver reusing the same request schema the API validates — literally one schema, two enforcement points.
- Player is a self-contained module (`apps/web/src/modules/player`) consuming only the manifest JSON — designed to be extractable to React Native later.
- Accessibility gate: `axe` in Playwright for player + auth + story form; contrast tokens via Tailwind theme, not ad-hoc hex.

### 6.7 Naming
- Files kebab-case; React components PascalCase files allowed inside `components/`. DB: snake_case tables/columns, plural tables. Booleans read as predicates (`isReady`, `hasConsented`). Queue names: `story.plan|illustrate|narrate|assemble` (dot-namespaced, singular stage verbs). R2 keys: `u/{userId}/{kind}/{entityId}/{hash}.{ext}` — deterministic (idempotency) and user-prefixed (deletion cascade = prefix delete).

---

## 7. Database Engineering Standards
- Every table: `id` (uuid v7 — time-sortable), `created_at`, `updated_at`; user-owned tables always `user_id` + composite index `(user_id, created_at desc)`.
- Prisma client access ONLY through `packages/db` repositories; raw `prisma.*` in apps is lint-blocked. Repositories take `userId` as a required first argument for user-scoped entities — tenancy enforced by signature, not by memory.
- Migrations: generated names prefixed with intent (`add_`, `backfill_`, `drop_`), reviewed as SQL (the generated SQL goes in the PR), never edited after merge, `migrate deploy` only (never `db push` outside local).
- Transactions wrap credit-ledger writes + the state change they pay for (one atomic unit); ledger rows are INSERT-only — an UPDATE or DELETE on `credits_ledger` is a CI-greppable offense.
- JSONB (`manifest_jsonb`) is a read model, not a source of truth — anything you filter/aggregate on gets a real column.
- Connection budget: Prisma pool sized per service replica (Railway PG connection limits are real); PgBouncer added when `(replicas × pool) > 60%` of limit.

---

## 8. Testing Standards (execution details for plan §16)
- Colocated `*.test.ts`; `apps/*/test/` only for cross-module integration. Test names are behavior sentences: `refunds credit when pipeline fails after final retry`.
- Coverage: no vanity global %. Enforced 90%+ on `packages/shared`, `packages/db` repositories, pipeline stage functions, and billing; UI covered by Playwright flows instead.
- Provider fixtures: recorded once into `packages/providers/fixtures/`, faked with msw/undici mock; a `RUN_LIVE=1` nightly re-records drift and diffs schemas (provider API drift is detected by CI, not by production).
- Test data: factory functions (`makeUser()`, `makeStory()`) in `packages/shared/testing` — no shared mutable seed data; integration tests run against a disposable Postgres (testcontainers) with real migrations, never mocks of the DB.
- The judge-regression suite is versioned: prompt changes commit updated expected-score baselines in the same PR (like snapshot tests, but for story quality).

---

## 9. Secrets & Configuration
- All runtime config parsed at boot by a zod `env.ts` per app — missing/invalid env = crash at startup, never a runtime surprise. `.env.example` is the authoritative variable inventory, updated in the same PR that adds a variable (checklist item).
- Local dev: `.env.local` gitignored; `direnv` optional. CI: GitHub environments (`staging`, `production`) with environment-scoped secrets. Runtime: Railway variables; R2 tokens least-privilege and per-service (api: sign-only where possible; worker: write; backup job: separate bucket-scoped token).
- gitleaks pre-commit hook (lefthook) + CI job; a leaked secret = rotate immediately per runbook, then post-mortem the path it leaked through.
- Key rotation calendar: R2 tokens & webhook secrets every 90 days (calendar reminder; scripted in `infra/scripts/rotate.md`).

---

## 10. Documentation Standards
- **ADRs** (`docs/adr/NNNN-title.md`, MADR-lite format: Context/Decision/Consequences, ≤ 1 page): required for provider choices, framework majors, anything on the §2.3 non-choice list being revisited, and any rule in this handbook being changed. ADRs are immutable; supersede, don't edit.
- Each app/package has a ≤ 1-page README: purpose, run commands, key entry points. The root README is the 10-minute onboarding path (clone → `pnpm i` → `pnpm dev` with docker-compose PG/Redis → first story generated locally with mock providers).
- Runbooks in `docs/runbooks/` (see plan §13.3); each runbook is tested once when written (game-day style, 30 min).
- This handbook and `docs/plan.md` are living docs — changes via PR like code, `docs:` commits.

---

## 11. Working with Claude Code (development operating model)

### 11.1 Session discipline
- One issue = one session = one branch = one PR. (Sprint mode runs several such sessions in parallel — coordination rules in protocol §12.) Start every session by pointing Claude Code at the issue and the relevant plan/handbook sections; end every session with `pnpm check` green and a PR opened (or the branch explicitly parked with a WIP note on the issue).
- **Plan first, then code**: for anything non-trivial, ask for a plan (plan mode), review the plan against acceptance criteria, THEN authorize implementation. Correcting a plan costs seconds; correcting an implementation costs hours.
- Keep sessions scoped: if Claude Code discovers an unrelated problem mid-task, it files an issue (`gh issue create`) instead of fixing it in the same branch — drive-by fixes are how 400-line PRs become 1,400-line PRs.

### 11.2 CLAUDE.md (root) — expanded contract
The plan's CLAUDE.md starter (plan §8.2) is extended with process rules:
```md
## Process (binding — see docs/engineering-handbook.md)
- Branch: <type>/<issue>-<slug> from main. Never commit to main.
- Commit style: conventional commits; PR title must be a valid conventional commit.
- Before opening/updating a PR: pnpm check (typecheck+lint+test+depcruise) must pass.
- PRs ≤ 400 changed LOC excl. lockfile/generated. Slice larger work; use feature flags.
- DB changes: expand→contract only; paste generated SQL into the PR description.
- New env var → update .env.example + apps/<x>/src/env.ts in the same PR.
- Vendor SDKs only inside packages/providers. New provider call → note $/story impact in PR.
- Unrelated findings → gh issue create, do not fix in-branch.
- When acceptance criteria are ambiguous: stop and ask, do not guess billing/privacy behavior.
```
- Per-package `CLAUDE.md` files add local context (e.g., `apps/worker/CLAUDE.md`: stage function purity rule, idempotency-key scheme, how to run one stage against fixtures).
- CLAUDE.md is maintained like code: when a review keeps catching the same mistake, the fix is a new CLAUDE.md line, not a repeated comment.

### 11.3 Task specification quality (`good-claude-task` label bar)
An issue is ready for Claude Code when it has: goal (1 sentence), acceptance criteria (testable bullets), pointers (files/modules involved), out-of-scope line, and — for pipeline/billing — the failure cases enumerated. Writing this takes 5 minutes and doubles first-pass success rate; vague issues get implemented vaguely.

### 11.4 Review protocol (solo founder + AI)
1. Self-review the diff on GitHub (human pass — product sense, scope creep, "would I be happy to be paged on this?").
2. Fresh Claude session reviews the PR (`gh pr diff`) against the handbook with an explicit reviewer prompt: check tenancy scoping, error-code usage, expand/contract, logging hygiene, test adequacy. A fresh session has no author bias.
3. Nightly suites (live smokes, judge regression) are the retroactive third reviewer; a nightly failure caused by yesterday's PR gets a revert-first response.

### 11.5 Guardrails on agent autonomy
- Claude Code never: force-pushes, edits applied migrations, touches `main` directly, changes prices/credit amounts, disables a failing test, or modifies moderation thresholds — these five require explicit human instruction in the session (also stated in CLAUDE.md).
- Long autonomous runs (multi-hour agent sessions) are fine for scaffolding/tests/refactors; anything touching money, consent, deletion, or moderation is built in short supervised iterations.

---

## 12. Environments & Local Development
- `docker-compose.dev.yml`: Postgres 16, Redis 7, MinIO (local S3 stand-in for R2), Mailpit (SMTP catcher). `pnpm dev` boots all apps with mock providers by default (`PROVIDERS=mock`) — a full story generates locally in ~5 s with fixture images/audio; `PROVIDERS=live` opt-in per session.
- Seed script creates a demo user, one character with fixture sheet, one completed story — the app is demo-able 60 seconds after clone.
- Parity rule: anything that differs between local/staging/prod (URLs, buckets, flags) lives in env config; code never branches on `NODE_ENV` for behavior (only for logging verbosity).

---

## 13. Definition of Ready / Definition of Done
**Ready (issue may enter "Ready" column):** goal + testable acceptance criteria + scope boundary + (if user-facing) rough UX described + (if pipeline/billing) failure cases listed + estimate ≤ 2 days (else split).

**Done (PR may merge):**
1. Acceptance criteria demonstrably met (tests named after them pass)
2. `pnpm check` + full PR CI green; no quarantined test added
3. Checklist items in PR template answered honestly (cost, privacy, migration, env)
4. Docs touched if behavior/contract changed (README/ADR/handbook/.env.example)
5. Observability: new failure modes log at correct level with requestId; new business event emits its analytics event
6. Feature flag + removal issue if the feature is dark
7. Deployed to staging and eyeballed (for user-facing changes: on a phone, not just desktop — parents use this on phones in a dark bedroom)

---

## 14. Incident & Operational Process
- Severities: **SEV1** payments broken / data exposure / site down; **SEV2** pipeline success < 90% or a stage down; **SEV3** degraded UX. SEV1 response: stabilize (rollback/flag off) → communicate (status note in-app) → then diagnose.
- Alert routing: Railway/Grafana alerts → Telegram/phone (solo-appropriate; PagerDuty is overkill until team ≥ 3). Every SEV1/SEV2 gets a blameless ≤ 1-page post-mortem in `docs/postmortems/` with 1–3 action items filed as `prio:p0/p1` issues — the post-mortem habit matters more solo than in teams, because nobody else will remember.
- Weekly ops review (30 min, calendar-blocked): DLQ, cost/story trend, judge-score trend, moderation queue SLA, error budget. This meeting-with-yourself is what keeps a solo-operated production system honest.

---

## 15. Quick Reference Card
```
pnpm i                  install          pnpm dev            run everything (mock providers)
pnpm check              typecheck+lint+test+depcruise (must pass before PR)
pnpm test --filter api  scoped tests     pnpm db:migrate     apply migrations locally
pnpm db:studio          inspect DB       pnpm gen:openapi    regenerate API spec
gh pr create --fill     open PR          gh issue create     file a finding
Branch:  feat/142-slug   PR title: feat(api): add page regeneration endpoint
Merge:   squash only     main = production. Small PRs. Contracts first. Idempotent everything.
```
