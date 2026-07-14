# ADR-0001 — API framework: Fastify 5 + zod type provider

- Status: Accepted
- Date: 2026-07-14
- Deciders: Tolga
- Context refs: plan §8.4, engineering-handbook §2.1/§6.3

## Context
The API layer needs request/response validation, good TypeScript ergonomics, and
low ceremony so Claude Code can move fast without a heavy framework surface. The
contract-first principle (handbook #3) means schemas — not hand-written types —
must be the single source of truth on both the wire and the code.

## Decision
Use **Fastify 5** with **`fastify-type-provider-zod`**. zod schemas from
`@masalai/shared` drive both runtime validation and inferred handler types, so a
route's schema is its contract. Request ids are propagated into job payloads and
worker logs (handbook §6.4).

## Consequences
- (+) One schema per boundary, validated at the edge; no drift between types and validation.
- (+) Less boilerplate than NestJS → faster agent iteration; smaller mental model.
- (+) Mature plugin ecosystem (auth, rate-limit, CORS) for later milestones.
- (−) Fewer batteries-included conventions than NestJS; we impose our own structure.
- Revisit only if we hit a concrete Fastify limitation; superseding needs a new ADR.
