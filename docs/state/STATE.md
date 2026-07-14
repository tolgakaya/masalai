# STATE — updated 2026-07-14 (session: chore/1-s0-bootstrap · S0a morning)

> Multi-stream format (protocol §12 rule 2). During S0 a single session writes the **S0** block below;
> streams A/B/C activate Day 2. On conflict, git + this file win over Serena memory / /sc:save.

## INTEGRATION (owned by integrator — Tolga)
- Milestone: **M0 / S0** — bootstrap. Repo: github.com/tolgakaya/masalai (private).
- Bootstrap exception used once: `docs:` commit direct to main (c8994e5). Branch protection goes ON after PR #1 merges (handbook §4.5).
- Pending merges: PR #1 (chore/1-s0-bootstrap, S0a) — draft.
- Contract PRs in flight: none.
- Next merge window: end of S0a; Day-2 windows ~13:00 + EOD (protocol §12 rule 4).

## S0 block (active this session)
### Milestone: M0 · S0a (skeleton + protocol infra) — in progress
Issue #1 — Day 1 S0 bootstrap
Branch: chore/1-s0-bootstrap   PR: (draft, opens at session end)
Done: —
NOW:  Block 1 · step 1 — write protocol state files + root CLAUDE.md
Then: .claude/commands + settings.json; monorepo root (pnpm/turbo/tsconfig/biome)
Watch out: pin baseline majors, not npm-latest (DECISIONS 2026-07-14, handbook §2.2)

### Next steps after Block 1
Block 2: shared → docker-compose → db(prisma §4.5) → api → worker → web/ui/providers → walking-skeleton test
Block 3: dependency-cruiser → CI → ADR 0001-0004 → Day-2 issues #2/#3/#4 → PR

### Blockers / waiting on Tolga
None blocking. Human-track (parallel, not agent): MoR account, domain/DNS, legal-text review (kickoff §A.4).

## Stream A — apps/worker + packages/providers  (activates Day 2, issue #2)
_dormant until Day 2_

## Stream B — apps/api + packages/db  (activates Day 2, issue #3)
_dormant until Day 2_

## Stream C — apps/web + packages/ui  (activates Day 2, issue #4)
_dormant until Day 2_
