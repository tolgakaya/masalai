# ADR-0003 — ORM: Prisma 6

- Status: Accepted
- Date: 2026-07-14
- Deciders: Tolga
- Context refs: plan §8.4, engineering-handbook §2.1/§7, DECISIONS 2026-07-14

## Context
The data layer needs a typed schema, first-class migrations, and excellent
documentation so an AI pair can navigate it reliably. Tenancy (every query scoped
by `user_id`) must be enforceable at the repository layer (handbook §7).

## Decision
Use **Prisma 6** (pinned 6.19.3 — baseline major, not day-one Prisma 7). Access
is only through `packages/db` repositories that take `userId` as their first
argument; raw `prisma.*` outside that package is lint/depcruise-blocked. The
classic `prisma-client-js` generator is used over the Early-Access
`prisma-client` generator (see DECISIONS 2026-07-14 for the ESM/strict-tsc
rationale).

## Consequences
- (+) Best-documented option -> best agent velocity; strong migration tooling (expand->contract).
- (+) Generated types keep the DB contract honest; repositories make tenancy a signature, not a habit.
- (−) Prisma owns migration semantics; we follow expand->contract and never edit applied migrations.
- (−) Client generates into node_modules (classic generator); revisit the new generator when Prisma 7 forces it (new ADR).
