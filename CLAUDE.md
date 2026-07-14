# MasalAI
Personalized AI storybook SaaS: parent uploads a child's photo + picks topic & moral →
async pipeline generates a 10-page illustrated, narrated fairy tale. Full context in docs/.

## Governing docs (read the section a task points to; don't bulk-read)
- docs/plan.md — WHAT: product/architecture/security/business (§4.5 data model, §17 sprint plan)
- docs/engineering-handbook.md — HOW: stack/versions, repo rules, git/PR/CI, coding & DB standards
- docs/claude-code-protocol.md — working agreement (context-loss resilience, §12 parallel mode)
- docs/ux-design-plan.md — night-first design system (§4 tokens, §14 build order)
- docs/marketing-plan.md · docs/ai-provider-scale-architecture.md — reference on demand
- docs/adr/ — immutable decisions. docs/state/ — living memory (STATE/DECISIONS/QUESTIONS).

## Session protocol (binding — protocol §4)
- Start: /start (read STATE.md, reconcile with git, pnpm check baseline). End: /end then /sc:save.
- Filesystem is memory; chat is not. Decisions → DECISIONS.md; progress → STATE.md; questions → QUESTIONS.md.
- Serena memory & /sc:save are caches only. On conflict, docs/state/* + git win.
- After any compaction/resume: re-read STATE.md + the file you're about to edit; re-run pnpm check.

## Stack
pnpm + Turborepo monorepo. apps/web (Next 16), apps/api (Fastify 5), apps/worker (BullMQ 5).
packages/shared = ALL zod schemas & types (API/queue contracts — never duplicated).
packages/providers = Text/Image/TTS/Moderation adapters (vendor SDKs live ONLY here).
packages/db = Prisma client + userId-first repositories. packages/ui = tokens + components.

## Hard rules
- TypeScript strict; no `any` (use unknown + zod). Validate all external input with zod.
- Every DB query scoped by user_id (repository takes userId first). Add a cross-tenant IDOR test per new asset/story route.
- All jobs idempotent; deterministic R2 keys; retries safe. Payloads carry `v` field.
- Never log photo/signed URLs, provider keys, or child names in prompts (log hashes/ids).
- Trunk-based: branch <type>/<issue>-<slug> from main; NEVER commit to main. PR title = conventional commit.
- PRs ≤ 400 changed LOC (excl. lockfile/generated); slice larger work behind feature flags.
- DB changes expand→contract only; paste generated SQL in the PR. Migrations via `pnpm db:migrate`; never edit applied migrations.
- New env var → update .env.example + apps/<x>/src/env.ts in the same PR.
- Vendor SDK call → note $/story cost impact in PR. Update Doc-Touch Matrix (protocol §7) docs in the same PR.
- Unrelated finding → `gh issue create`, don't fix in-branch. Run `pnpm check` before declaring done.

## Doc-or-ask (protocol §6.1) — STOP and ask, never guess:
prices/credits, consent/privacy behavior, retention periods, moderation thresholds,
provider selection, any user-facing Turkish copy. → append to QUESTIONS.md + comment on the issue.

## NEVER without explicit in-session instruction (protocol §8.4, handbook §11.5)
force-push · edit applied migrations · commit to main · change prices/credits/refunds ·
disable/skip a failing test · alter moderation thresholds · rewrite docs/state/DECISIONS.md or docs/adr/ history ·
mark a criterion "done" without freshly executed evidence.
