# MasalAI — Day 1 Kickoff (Sprint Edition, SuperClaude)
### One-time prep + BOTH Day-1 prompts (morning & afternoon) — supersedes the earlier week-based kickoff

> Sprint plan (plan §17): S0 = **Day 1**, in two sessions. Morning: local walking skeleton + protocol infrastructure. Afternoon: Railway staging deploy. Parallel streams A/B/C start Day 2 under protocol §12. This doc contains the exact prompts for both Day-1 sessions.

---

## A. One-time prep (terminal, ~15 minutes, before the morning session)

```bash
# 1. Repo
mkdir masalai && cd masalai && git init -b main
gh repo create <org>/masalai --private --source=. --remote=origin

# 2. ALL SIX governing docs go in FIRST — they are the seed of everything
mkdir -p docs
#   docs/plan.md                    ← masal-saas-plan-v2.md (sprint edition)
#   docs/engineering-handbook.md
#   docs/claude-code-protocol.md    (incl. §12 parallel-session mode)
#   docs/ux-design-plan.md
#   docs/marketing-plan.md
#   docs/ai-provider-scale-architecture.md   (+ docs/reference/AI_PROVIDER_SCALE_ARCHITECTURE.md, ZiraAI)
#   docs/m0-kickoff.md              ← this file
git add docs && git commit -m "docs: add governing document set (plan, handbook, protocol, ux, marketing, kickoff)"
git push -u origin main   # sanctioned bootstrap exception: the ONLY direct-to-main commit ever;
                          # branch protection (handbook §4.5) goes on right after PR #1 merges

# 3. SuperClaude v4.x
pipx install superclaude
superclaude install                          # /sc: commands
superclaude mcp --servers serena context7

# 4. HUMAN-ONLY Day-1 items (no agent can do these — start them before coding):
#    - Merchant-of-Record account application (Paddle or Lemon Squeezy) — plan §7.2, hour 1
#    - Domain purchase + DNS to Railway/Cloudflare
#    - Send Claude-drafted KVKK/ToS texts to müşavir/lawyer for async review (agent drafts them Day 1–2)

# 5. Start Claude Code
claude
#   serena activate_project .
#   serena onboarding
```

## B. Session flow (every session)
| Moment | Action |
|---|---|
| Start | `/sc:load` → (from session 2 on) our `/start`; Day-1-morning uses prompt C1 |
| Planning | `/sc:workflow` output = the step plan; you approve before any code |
| Building | `/sc:implement` step by step |
| Checkpoint | our `/checkpoint` (commit + STATE.md) — protocol §4.2 |
| End | our `/end` ritual, then `/sc:save` |

**Alignment rule (embedded in both prompts):** Serena memories and `/sc:save` are convenience caches. `docs/state/*` and git are the source of truth; on conflict, repo files win.

---

## C1. MORNING PROMPT — paste verbatim after `/sc:load`

```
# MasalAI — Day 1 MORNING session (S0a: skeleton + protocol infrastructure)

## Step 0 — Read before touching anything (in this exact order)
1. docs/claude-code-protocol.md — binding working agreement. Pay special attention to
   §6.1 doc-or-ask, §8.4 never-do list, and §12 PARALLEL-SESSION MODE (Day 2 depends on it).
2. docs/engineering-handbook.md — stack & pinned-version policy (§2), repo architecture
   rules (§3, incl. packages/ui), git/PR standards (§4), CI/CD (§5), coding standards (§6).
3. docs/plan.md — read §1–§4 and §17 (sprint plan) fully; rest is reference on demand.
4. docs/ux-design-plan.md — read ONLY §4 (token contract) and §14 (build order):
   packages/ui is scaffolded EMPTY today; tokens/components start Day 2, stream C.

Then, BEFORE any scaffolding, confirm understanding by stating in your own words:
(a) the never-do list, (b) the forbidden-guess domains, (c) checkpoint cadence,
(d) the Doc-Touch Matrix files you must update today, (e) the three Day-2 streams and
what makes packages/shared special in parallel mode (protocol §12 rule 3).
Wait for my "onaylıyorum" after that.

## Alignment rule (SuperClaude/Serena)
Serena memories and /sc:save are convenience caches only. docs/state/*, docs/sessions/*
and git history are the single source of truth. On any conflict, repo files win. Never
store a decision only in Serena memory — DECISIONS.md is where decisions live.

## Mission — S0a (this morning). Create issue #1 "Day 1: S0 bootstrap" via gh,
branch chore/1-s0-bootstrap, and deliver:

1. PROTOCOL INFRASTRUCTURE FIRST (before any app code):
   - docs/state/STATE.md in MULTI-STREAM format (protocol §12 rule 2): blocks for
     Stream A (worker+providers), Stream B (api+db), Stream C (web+ui), plus a top
     INTEGRATION block. Today's session writes into a temporary "S0" block.
   - docs/state/DECISIONS.md, QUESTIONS.md (templates: protocol §3.2–3.3); docs/sessions/
   - Root CLAUDE.md ≤60 lines per handbook §11.2 + protocol §5.4, referencing all six
     docs by path; apps/*/CLAUDE.md stubs
   - .claude/commands/{start,end,checkpoint,recover,decide,question,review-pr}.md
     implementing protocol §8.2 verbatim
   - .claude/settings.json: permissions + PreCompact/PostToolUse/Stop hooks (protocol §8.1–8.3)
2. Monorepo per handbook §3: pnpm workspaces + Turborepo; apps/web (Next.js 16 App
   Router), apps/api (Fastify 5 + zod type provider), apps/worker (BullMQ 5);
   packages/{shared,db,providers,ui} — ui SCAFFOLDED EMPTY (placeholder index, no
   tokens yet). Dependency direction §3.1 enforced by dependency-cruiser in CI.
   Strict tsconfig.base per §6.1; Biome per §6.2. Verify every pinned version with
   `npm show <pkg> version` — never from memory.
3. Local dev: docker-compose.dev.yml (Postgres 16, Redis 7, MinIO, Mailpit); per-app
   env.ts zod validation + .env.example; `pnpm dev` boots everything with
   PROVIDERS=mock; seed script stub.
4. Prisma schema v1 exactly from plan.md §4.5 + first migration; packages/db repository
   skeleton with mandatory userId-first signatures (handbook §7).
5. CI: .github/workflows/pr.yml + main.yml per handbook §5.1 (nightly.yml stub);
   PR template §4.4; lefthook + gitleaks; labels + issue forms per §4.6.
6. docs/adr/0001-fastify.md .. 0004-biome.md — one page each, rationale from
   plan §8.4 / handbook §2.1.
7. Walking skeleton proving the async spine: POST /internal/health-job (api) enqueues →
   worker consumes and writes a row → GET /internal/health-job/:id returns it.
   requestId propagated api→queue→worker logs (handbook §6.4–6.5). One integration test.
8. BEFORE /end: draft the three Day-2 stream issues via gh (#2 Stream A: character
   pipeline stages — context pointer MUST include docs/ai-provider-scale-architecture.md
   (router, admission, breaker are Stream A scope); #3 Stream B: character/story api+db; #4 Stream C: ui tokens +
   wizard shell) — each DoR-complete per protocol §9.1, acceptance criteria derived
   from plan §17 Days 2–3 scope, context pointers included.

## Timebox honesty
This is a HALF-DAY session. First produce the ordered step plan (each step ≤ ~30 min,
one commit-able unit) with a time estimate per step and WAIT for my approval. If the
total exceeds the morning, SAY SO in the plan and propose which deliverables move to
the afternoon session — never silently compress quality (tests, protocol files) to fit.

## Method
- Checkpoint commit + STATE.md update after every completed step, not at the end.
- Any gap (naming, version, Railway detail not covered by the handbook): protocol §6.1 —
  cite the doc section you used, or write to QUESTIONS.md and take a non-blocked step.
  Do not guess. Do not ask me in chat what a doc already answers.
- At ~70% context: /checkpoint, tell me, we /clear and resume from STATE.md.

## Out of scope THIS SESSION
Real AI provider integrations; auth flows beyond Better Auth skeleton config; payment
anything (MoR account is my job, integration is Days 10–11); Railway staging deploy
(this afternoon's session — produce infra/railway config files only); any business
logic; any UI beyond one placeholder page per app; packages/ui content.
```

---

## C2. AFTERNOON PROMPT — new session, after `/sc:load` + `/start`

```
# MasalAI — Day 1 AFTERNOON session (S0b: staging deploy)

Read docs/state/STATE.md and reconcile with git (protocol §4.1). Baseline: pnpm check.

**S0b is executed per docs/railway-deployment.md — it is normative for infra/railway/**
and Railway mechanics (handbook §5.3 defers to it). STEP 1 of this session is: read
docs/railway-deployment.md (esp. §2 service settings, §3 Dockerfile pattern, §4 config-as-code,
§5.3 ioredis family:0, §7 gotcha catalog). Every Dockerfile/railway.json below follows it.**

Mission — issue #5 "S0b: staging deploy", branch chore/5-staging-deploy:
1. Railway project: environments (staging, production-empty), services web/api/worker
   from the repo with watch-paths per railway-deployment.md §2 / handbook §5.3; Postgres + Redis provisioned;
   R2 buckets + least-privilege tokens documented in .env.example (I will create the
   Cloudflare R2 buckets and paste tokens into Railway variables when you tell me
   exactly which variables you need — list them, don't invent values).
2. api pre-deploy: prisma migrate deploy; worker graceful-shutdown verified (§5.3).
3. Deploy gating: CI-green requirement wired (or `railway up` from main.yml final job
   if the plan doesn't support check-gating — decide via doc-or-ask, record in DECISIONS.md).
4. EXIT EVIDENCE (protocol §6.2, freshly executed): the walking skeleton runs ON STAGING —
   paste the curl round-trip output and the worker log line with the propagated requestId.
5. Update docs/state/STATE.md (S0 block → done; INTEGRATION block → Day-2 merge windows),
   session log, PR; remind me to (a) squash-merge PR #1+#5, (b) turn on branch
   protection per handbook §4.5, (c) run the four protocol drills (§10) with you now —
   Day 2 does not start until the drills pass on the multi-stream STATE.md format.
```

---

## D. End of Day 1 — human checklist
1. Squash-merge PRs; enable branch protection (handbook §4.5, exact settings).
2. Run the four failure drills (protocol §10) — including the parallel-format STATE.md.
3. Verify MoR application submitted, domain live, legal texts sent for review.
4. Tomorrow 09:00: open THREE terminals, `/sc:load` + `/start` in each, assign issues
   #2/#3/#4 — one stream per session (protocol §12). You are the integrator: merge
   windows at ~13:00 and end-of-day.
