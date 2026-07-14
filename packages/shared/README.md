# @masalai/shared

The single home for **cross-boundary contracts**: zod schemas, their derived
types, shared constants, and the domain error / `Result` types. Every boundary
(API, queue payload, provider adapter, analytics event) is defined here as a zod
schema *before* implementation, and types are inferred from the schema — never
hand-written twice (engineering-handbook principle 3, §3.1).

**Depends on nothing internal.** `db`, `providers`, `ui`, and the apps import
_from_ `shared`; `shared` imports from none of them.

## Contents

| Module          | Exports                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `health-job.ts` | `healthJobPayloadSchema`, `HealthJobPayload`, `parseHealthJobPayload`    |
| `errors.ts`     | `ErrorCode`, `DomainError`, `domainError`, `Result`/`Ok`/`Err`, helpers  |
| `constants.ts`  | `HEALTH_JOB_QUEUE`, `HEALTH_JOB_PAYLOAD_VERSION`                         |

`healthJobPayloadSchema` is the api → queue → worker contract for the S0 walking
skeleton (m0-kickoff §7). Queue payloads carry a `v` field so workers survive
in-flight across deploys (§5.6); `ErrorCode` is a closed union and is API
contract — codes never change meaning once shipped (§6.2).

## Commands

```bash
pnpm --filter @masalai/shared build      # tsc → dist (declarations + maps)
pnpm --filter @masalai/shared typecheck  # tsc --noEmit
pnpm --filter @masalai/shared test       # vitest run
```
