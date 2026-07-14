# ADR-0002 — Auth: Better Auth

- Status: Accepted
- Date: 2026-07-14
- Deciders: Tolga
- Context refs: plan §8.4, engineering-handbook §2.1

## Context
MasalAI handles children's photos — a high-sensitivity data category. Auth must
keep user data self-owned (not siloed in a third-party identity vendor) and must
not add per-MAU cost that scales badly against a consumer product's margins.

## Decision
Use **Better Auth**: session/user data lives in our own Postgres, no per-MAU
pricing, first-class TypeScript. S0 wires only the skeleton config; full flows
(email/OAuth, sessions, consent capture) land in the milestone that needs them.

## Consequences
- (+) User + session data owned in-DB — important for a child-photo product and KVKK erasure.
- (+) No per-MAU fee; cost scales with our own infra, not a vendor's seat count.
- (+) Integrates with the Prisma schema (users table already in plan §4.5).
- (−) More of the auth surface (rate-limiting, breach monitoring) is our responsibility.
- (−) Younger ecosystem than Clerk/Auth0; mitigated by owning the data and a thin adapter.
