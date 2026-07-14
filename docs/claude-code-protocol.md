# MasalAI — Claude Code Operating Protocol
### Context-Loss Resilience, Persistent Plan Tracking & Documentation-Driven Development

> Third document of the set (`docs/plan.md` = what, `docs/engineering-handbook.md` = how, this = **how we work with an AI agent that forgets**). Binding for every Claude Code session. Its single premise:
>
> **The context window is a cache, not a memory. Anything that exists only in the conversation is already lost.** Git, the filesystem, and GitHub issues are the memory. Every workflow below exists to make compaction, session death, and model restarts *non-events*.

---

## 1. Threat Model — what actually gets lost, and when

| Failure mode | What happens | What it destroys if unmanaged |
|---|---|---|
| **Auto-compaction** | Context fills → Claude Code summarizes the conversation; details, earlier file contents, and nuanced instructions are lossy-compressed | Mid-task state, "we agreed X earlier", subtle constraints from docs read 100 turns ago |
| **Session end / crash / laptop close** | Conversation gone (partially recoverable via `--resume`, but never rely on it) | Everything not committed or written to a file |
| **Stale context** | File was read early in session, edited since (by Claude or you); Claude reasons over the old version | Wrong edits, phantom merge conflicts |
| **Assumption drift** | A gap in the spec gets silently filled with a plausible guess; 30 turns later the guess is treated as fact | Billing/privacy/product correctness — the expensive class of bug |
| **Plan drift** | Local decisions accumulate in chat but never reach plan/handbook; next session contradicts them | Consistency across sessions; docs become fiction |
| **Done-claim without proof** | "Implemented and tested" said from memory of intent, not from a fresh command run | Trust in status tracking; broken main |

Every rule in this protocol maps to one of these six. When in doubt, ask: *"if the context were wiped right now, would this survive?"* If no — write it to disk **now**, not at session end.

---

## 2. Core Principles

1. **Filesystem-as-memory.** Decisions → docs. Progress → `docs/state/`. Code state → git commits. Open questions → GitHub issues. Chat is for thinking, never for storing.
2. **Doc-or-ask, never assume.** If needed information isn't in the docs or the code, Claude Code STOPS and asks (or files a question issue). A guess written into code is a defect even if it happens to be right — because it's untracked. Explicitly forbidden guess domains: prices/credits, consent & privacy behavior, retention periods, moderation thresholds, provider selection, anything user-visible in Turkish copy.
3. **Checkpoint-driven work.** Commit at every green sub-step (WIP commits are fine on branches — squash-merge erases them from `main` history). A branch's commit log must let a *fresh session with zero context* reconstruct where work stopped.
4. **Single source of truth per fact, with pointers.** Each fact lives in exactly one document; everything else links to it. CLAUDE.md stays SHORT (pointers + hard rules only) because it's the only file guaranteed to be in every context — bloating it crowds out working memory.
5. **Small context, not survived compaction.** The goal is to *finish tasks before compaction*, not to compact gracefully. Task sizing, `/clear` between tasks, and subagents for bulk reading are the primary tools; compaction handling is the fallback.
6. **Update docs in the same PR as the change.** Documentation drift is a bug with a `prio:p1` label. The Doc-Touch Matrix (§7) says exactly which doc each kind of change must update — "did I update the matrix-required docs?" is a PR checklist item, and the reviewer prompt checks it.
7. **Trust files, not recall.** After ANY resume, compaction, or doubt: re-read the state file and re-run `pnpm check` before continuing. Never edit a file that hasn't been read (or re-read) in the current post-compaction context.

---

## 3. The Document System (memory architecture)

```
CLAUDE.md                     ← always in context. Pointers + 10 hard rules. ≤ 60 lines, forever.
docs/
  plan.md                     ← WHAT: product/architecture/business (v2). Changes via PR only.
  engineering-handbook.md     ← HOW: standards, git, CI/CD. Changes via PR only.
  claude-code-protocol.md     ← THIS file.
  adr/NNNN-*.md               ← immutable decisions with rationale.
  state/                      ← THE LIVING MEMORY (updated every session, low ceremony):
    STATE.md                  ← single dashboard: milestone status, active task, next 3 tasks, blockers.
    DECISIONS.md              ← append-only log of small decisions that don't merit an ADR.
    QUESTIONS.md              ← open questions awaiting Tolga; answered ones moved to DECISIONS with the answer.
  sessions/                   ← one small log per session (template §9.2). Disposable history, greppable.
apps/*/CLAUDE.md              ← local context per app (≤ 30 lines each).
```

### 3.1 Ownership & update rules
| File | Who writes | When | Ceremony |
|---|---|---|---|
| `STATE.md` | Claude Code | **Start and end of every session; before any risky/long operation; immediately after completing a task** | None — overwrite freely, it reflects "now" |
| `DECISIONS.md` | Claude Code | The moment a decision is made in chat ("use uuid v7", "R2 key layout is X") | Append one line: date, decision, why, links |
| `QUESTIONS.md` | Claude Code | The moment doc-or-ask triggers and Tolga isn't in the loop right now | Append; blocks the dependent task |
| `sessions/YYYY-MM-DD-<slug>.md` | Claude Code | Session end (or PreCompact hook, §8.3) | Template, 2 minutes |
| plan / handbook / ADRs | Claude Code via PR, Tolga approves | Per Doc-Touch Matrix (§7) | Full PR review |

### 3.2 STATE.md — the recovery anchor (template)
```md
# STATE — updated 2026-07-11 14:32 (session: feat/142-character-approval)
## Milestone: M1 (pipeline e2e) — 60%
## Active task
Issue #142 — character sheet approval flow
Branch: feat/142-character-approval   PR: #147 (draft)
Done: schema + repo fns + POST route + happy-path tests (committed: a1b2c3d)
NOW:  rejection path — refund credit on reject          ← exact next action
Then: SSE event on approval; Playwright flow
Watch out: refund must reuse ledger idempotency key pattern (DECISIONS.md 2026-07-09)
## Next 3 tasks after this
#151 page-regen endpoint · #144 judge threshold config · #150 progress SSE for player
## Blockers / waiting on Tolga
QUESTIONS.md #3 — free regen count per story (2 or 3?) — blocks #151 pricing copy
```
Rules: `NOW:` is always a **single concrete action**, phrased so a zero-context session can execute it. STATE.md is ≤ 40 lines; history lives in git and session logs, not here.

### 3.3 DECISIONS.md entry format
```md
2026-07-11 | Refunds are new ledger rows (reason=refund), never row edits | keeps ledger append-only (handbook §7) | #142, PR #147
```
Weekly (ops review, handbook §14), entries that changed product/architecture get **promoted** into plan.md or an ADR by a `docs:` PR. Promotion never deletes the line (the file stays append-only per §8.4); instead the line gets an annotation appended: `… | promoted → ADR-0007`. DECISIONS.md is the chronological inbox; ADRs/plan are the curated archive.

---

## 4. Session Lifecycle Protocol

### 4.1 Session start ritual (also codified as `/start` command, §8.2)
1. Read `docs/state/STATE.md` + the active issue. (CLAUDE.md is auto-loaded.)
2. `git status && git log --oneline -10 && gh pr status` — reconcile reality vs STATE.md. **Git wins** over STATE.md if they disagree; fix STATE.md first.
3. Run `pnpm check` — establish a known-green (or known-red) baseline before touching anything.
4. Read ONLY the docs sections the task points to (issue must reference them — DoR). Bulk exploration goes to a subagent (§5.3).
5. Restate the task + acceptance criteria + `NOW:` action in one short message for confirmation, THEN work.

### 4.2 During the session — checkpoint cadence
- Commit every coherent green step (`wip(api): rejection path skeleton` — fine on branch).
- After completing any acceptance criterion: update STATE.md `Done:`/`NOW:` lines (30 seconds). This is the compaction insurance premium — paid continuously, not at the end.
- New decision made → DECISIONS.md immediately. New gap found → doc-or-ask (§6) immediately.
- Long operation coming (big refactor, dependency upgrade, generation run)? Update STATE.md `NOW:` to describe the operation and its rollback *before* starting it.

### 4.3 Session end ritual (also `/end` command)
1. `pnpm check` → commit or explicitly note red state in STATE.md (`NOW: fix failing test X in ...`).
2. Update STATE.md fully; write `docs/sessions/` log (template §9.2).
3. Push branch; open/update PR (draft ok) — unpushed work on a laptop is not "saved".
4. If task incomplete: comment the handoff block (§9.3) on the issue — the issue is readable from anywhere, unlike your disk.

### 4.4 Compaction & interruption handling
- **Prevention first**: at ~70% context (Claude Code shows usage; or when responses start referencing "earlier" vaguely), finish the current sub-step, checkpoint (commit + STATE.md), and prefer `/clear` + fresh start over continuing into auto-compact. A fresh session reading STATE.md is *more* reliable than a compacted one.
- If compaction is imminent and mid-sub-step: run the checkpoint anyway (commit WIP + STATE.md `NOW:`), then continue; the PreCompact hook (§8.3) is the safety net, not the plan.
- **After any compaction or `--resume`**: mandatory re-anchor — re-read STATE.md, re-read any file about to be edited, re-run `pnpm check`. Treat pre-compaction memory of file contents as false.

### 4.5 Cold recovery procedure (crash, new machine, weeks later)
```
1. cat docs/state/STATE.md              → intended state
2. git status; git log --oneline -15    → actual state (wins)
3. gh pr status; gh issue list --label prio:p0   → external state
4. pnpm check                            → executable truth
5. Reconcile: fix STATE.md to match reality; resume from NOW:
```
Target: **< 5 minutes from zero context to productive**. If recovery ever takes longer, the retro question is "which ritual was skipped?" — the answer goes into this doc or CLAUDE.md.

---

## 5. Context Budget Management (avoid compaction rather than survive it)

### 5.1 Task sizing for context
- A task must be completable — including tests and doc updates — well within one context window: rule of thumb **≤ ~2 hours of focused agent work, touching ≤ ~10 files**. Bigger → split at issue level before starting (DoR gate). The 400-LOC PR limit (handbook §4.4) and this rule reinforce each other.
- One session, one task. Finishing early? `/clear`, run `/start` for the next task. Never chain tasks in one context "to save time" — the second task inherits a half-full window and degraded attention.

### 5.2 Context hygiene rules
- Don't paste large files into chat; reference paths and let Claude Code read precisely what it needs (view specific line ranges over whole files where possible).
- Don't re-read files "to be sure" repeatedly — re-read only after edits or after compaction/resume (§4.4).
- Long command outputs (test logs, seeds): pipe to a file (`pnpm test 2>&1 | tail -40`), read the tail; full log stays on disk if needed.
- Delete dead ends: if an approach is abandoned, note the outcome in DECISIONS.md ("tried X, rejected: reason") and `git checkout` the mess away — don't carry failed-attempt residue in files or context.

### 5.3 Subagents for bulk work
Use the Task/subagent mechanism for anything that consumes lots of tokens but yields a small answer, keeping the main context clean:
- "Explore how BullMQ handles graceful shutdown in our worker + summarize in 10 lines"
- "Read all of packages/providers and list every place the retry budget is enforced"
- Codebase-wide searches, dependency research, reading vendor docs.
The main session receives the summary; raw exploration never enters primary context. Rule of thumb: reading > 3 files for background → subagent.

### 5.4 What CLAUDE.md may contain (bloat control)
Hard rules (the five never-do's, doc-or-ask domains), pointers to the four docs, the `/start`-`/end` protocol reference, `pnpm check` mandate — and nothing else. Anything explanatory belongs in the pointed-to docs. Monthly prune: if CLAUDE.md exceeds 60 lines, something moves out. Use the `#` quick-memory feature during sessions to capture a rule candidate, then triage it into the right doc in the weekly review — CLAUDE.md is not the dumping ground.

---

## 6. No-Assumption & Anti-Hallucination Rules

### 6.1 The doc-or-ask algorithm (binding)
```
Need info to proceed?
├─ In code or docs? → cite it: "per plan.md §10.3, retry budget = 2" and proceed.
│    └─ Cited section doesn't actually say that on re-read? → STOP, treat as unknown.
├─ Not found, and it's in a forbidden-guess domain (money, privacy, consent,
│  moderation, retention, provider choice, user-facing copy)? → STOP:
│    append to QUESTIONS.md, comment on issue, work on a non-blocked part or end session.
├─ Not found, low-stakes & reversible (variable name, internal structure)?
│    → decide, but log it in DECISIONS.md in the same turn. Undocumented decisions don't exist.
└─ Conflict between docs? → handbook wins on process, plan wins on product;
     file a docs-fix issue for the loser; note in DECISIONS.md which one you followed.
```

### 6.2 Claim discipline
- "Done" may only follow a **freshly executed** verification in the current context: the test run, the curl, the screenshot. Post-compaction memory of a passing test is not a passing test.
- Status reports use evidence form: "✅ #142 criteria 1–3: `stories.test.ts` 14 passed (just ran); ⏳ criterion 4 not started" — never narrative form ("mostly done, should work").
- References to prior agreements must cite a file: "per DECISIONS.md 2026-07-09" — if it can't be cited, it must be re-decided and logged. This single rule converts compaction from silent corruption into a visible "I need to re-establish X".
- Library/API facts: verify against the installed version (`node_modules` types, `npm show`, official docs via subagent) when behavior matters — training-data recall of an API is a hypothesis, not a fact. This stack pins recent majors (Next 16, zod 4) whose APIs moved; compile errors are cheaper than runtime surprises, so prefer writing a 5-line spike test over trusting recall.

---

## 7. Doc-Touch Matrix (which change updates which document — same PR, no exceptions)

| Change type | Must update |
|---|---|
| New/changed API endpoint or queue payload | shared schemas (is the contract) + OpenAPI regen; plan.md §4.6 if surface shape changed |
| New env var / secret | `.env.example` + `env.ts` (handbook §9) |
| Pipeline behavior (stages, retries, budgets, thresholds) | plan.md §4.4/§10 + ai-provider-scale-architecture.md + STATE.md; ADR if it's a strategy change |
| Provider added/swapped | ADR (mandatory) + plan.md §8.4 + providers README + cost table plan.md §7.3 |
| Price/credit/refund logic | plan.md §7.2 + DECISIONS.md + explicit Tolga sign-off in PR (never agent-initiated) |
| Consent/retention/deletion behavior | plan.md §5 + privacy policy source + Tolga sign-off |
| Process/tooling/CI rule | engineering-handbook.md |
| Deploy/infra change (Dockerfiles, Railway config, service settings, watch-paths) | railway-deployment.md + handbook §5.3 |
| Agent-workflow lesson learned | this file, or CLAUDE.md if it's a hard rule |
| Any decision at all | DECISIONS.md (one line, always — superset of the above) |

CI assist (cheap, effective): a workflow step warns when a PR touches `apps/worker/src/pipeline/**` without touching `docs/**`, or touches route files without schema changes — heuristic, warning-only, but it makes forgetting loud.

---

## 8. Claude Code Configuration (repo-checked-in, so every session inherits it)

### 8.1 `.claude/settings.json` (project-level, committed)
- **Permissions**: allow `pnpm *`, `git *` (except push --force), `gh *`, file edits within repo; deny `rm -rf`, network installs outside pnpm, `git push --force`, edits to `docs/adr/*` (immutable) and `prisma/migrations/*` of applied migrations.
- Default model settings per team standard; `cleanupPeriodDays` long enough for `--resume` to be a bonus (never a dependency).

### 8.2 Custom slash commands (`.claude/commands/*.md`, committed)
| Command | Content (imperative instructions to Claude) |
|---|---|
| `/start` | Execute session-start ritual §4.1 verbatim; finish by restating task + NOW: for confirmation |
| `/end` | Execute session-end ritual §4.3; output the handoff block for the issue comment |
| `/checkpoint` | Commit current green state, update STATE.md Done/NOW, one-line summary |
| `/recover` | Execute cold recovery §4.5; report discrepancies between STATE.md and git before resuming |
| `/decide <text>` | Append formatted entry to DECISIONS.md; echo it back |
| `/question <text>` | Append to QUESTIONS.md, comment on active issue, suggest non-blocked work |
| `/review-pr <n>` | Fresh-session reviewer protocol (handbook §11.4): check tenancy, error codes, expand/contract, logging hygiene, doc-touch matrix compliance, evidence-based test claims |

### 8.3 Hooks (`.claude/settings.json` hooks block)
- **PreCompact** → runs a script that appends a timestamped auto-checkpoint to STATE.md ("AUTO-CHECKPOINT before compaction: <git status --short summary>, branch, last commit") — guarantees a breadcrumb even if the ritual was missed.
- **PostToolUse(Edit|Write)** on `packages/shared/**` → runs `pnpm --filter shared typecheck` immediately; contract files fail fast.
- **Stop** → gentle check: if STATE.md wasn't modified this session and code was, print a reminder (warning, not block).
- Keep hooks < 5; each must run < 10 s. Slow hooks get deleted — friction kills protocol compliance.

### 8.4 Things Claude Code must NEVER do without explicit in-session instruction
(Restated from handbook §11.5, lives verbatim in CLAUDE.md): force-push; edit applied migrations; commit to `main`; change prices/credits; disable failing tests; alter moderation thresholds; **plus two protocol-level additions**: delete or rewrite history in `docs/state/DECISIONS.md` / `docs/adr/`, and mark an issue/criterion done without fresh executed evidence.

---

## 9. Templates

### 9.1 Issue handoff-readiness (DoR, agent edition)
```md
Goal: <1 sentence>
Acceptance criteria: <testable bullets — become test names>
Context pointers: <plan.md §x, handbook §y, files/modules>
Out of scope: <1 line>
Failure cases: <required for pipeline/billing tasks>
Est: <must fit one session; else split>
```

### 9.2 Session log (`docs/sessions/2026-07-11-character-approval.md`)
```md
Task: #142 · Branch: feat/142-character-approval · Result: partial (4/5 criteria)
Done: schema, repo fns, POST route, happy+reject tests (commits a1b2c3d..e4f5g6h)
Not done: SSE event on approval (NOW: in STATE.md)
Decisions: 1 → DECISIONS.md 2026-07-11 (refund = new ledger row)
Questions raised: none · Docs touched: plan §4.6 (endpoint added), .env.example (n/a)
Friction notes: none / <anything that should change this protocol>
```

### 9.3 Issue handoff comment (when parking incomplete work)
```md
⏸ Parked at: <NOW: line> · Branch feat/142-... pushed, PR #147 draft
Green: pnpm check ✅ (or: red — failing test X, cause hypothesis Y)
Resume: /start on #142 — STATE.md is current as of this comment.
```

---

## 10. Failure Drills (run each once during M0 — 15 minutes each, then trust the system)
1. **Kill-switch drill**: mid-task, close the terminal without ritual. Fresh session: `/recover`. Measure minutes-to-productive; fix whatever exceeded 5.
2. **Compaction drill**: artificially fill context (have Claude read several large files), let auto-compact trigger, then ask it to state the current task, NOW action, and last decision — verify answers come from files, not confabulation.
3. **Assumption drill**: give a task with a deliberately missing price value; verify Claude stops at QUESTIONS.md instead of inventing ₺.
4. **Stale-file drill**: edit a file manually mid-session; ask Claude to edit the same file; verify it re-reads first.
Passing all four = the protocol works. Re-run the drills after any major Claude Code version change.

---

## 11. Protocol Evolution
This document is maintained like code (PRs, `docs:` commits). The feedback loop: session-log `Friction notes` → weekly review → protocol change or deletion. **Deletion is a first-class outcome** — a ritual that isn't paying for itself in recovered context is pure overhead, and an engineering manager's job includes killing process, not only adding it.


---

## 12. Parallel-Session Mode (compressed-sprint addendum)
The sprint plan (plan §17) runs 2–4 Claude Code sessions per day in parallel. Parallelism breaks §3's single-writer assumption unless these rules hold:

1. **One workstream per session, disjoint file ownership.** A path has exactly ONE writing stream per day. Standing split: **Stream A** apps/worker + packages/providers · **Stream B** apps/api + packages/db · **Stream C** apps/web + packages/ui. `packages/shared` is owned by no stream — see rule 3.
2. **STATE.md becomes multi-stream:** one block per stream (template §3.2 each) plus a top `INTEGRATION` block (pending merges, contract PRs in flight, next merge window). A session edits only its own block; the integrator (Tolga) owns INTEGRATION.
3. **Contracts merge first.** Any change to `packages/shared` ships as a tiny schema-only PR, merged before dependent streams build on it — handbook principle 3 becomes a *scheduling* rule. A stream needing a contract change stops, files the schema PR, pings the integrator, and works on something else until it merges.
4. **Serialized merge windows, twice daily** (midday + end of day): per stream — rebase on main → `pnpm check` → squash-merge; after each window, one integration smoke on staging. Streams never merge each other's branches.
5. **DECISIONS.md / QUESTIONS.md stay shared single files** — append-only makes concurrent appends rebase-safe (keep both lines on conflict, never reorder history).
6. **Throughput ceiling is the human:** the founder is the integrator; run no more streams than you can review-merge twice a day. Practical max: 3–4. A fifth stream doesn't add speed — it adds merge debt.
7. Session logs stay one-per-session (`docs/sessions/DATE-streamX-slug.md`); the drill set (§10) is run once per sprint on the *multi-stream* STATE.md format before Day 2.
