# @masalai/db

Prisma schema + client + **repositories** for MasalAI. Apps import repositories
from this package and never touch Prisma directly — a lint/depcruise rule blocks
raw `prisma.*` outside `packages/db` (engineering-handbook §7). Repositories for
user-scoped entities take `userId` as their required first argument, so tenancy
is enforced by the function signature, not by memory.

## Layout

- `prisma/schema.prisma` — models (snake_case tables/columns, `timestamptz`).
- `prisma/migrations/` — committed migration history; expand→contract only,
  never edit an applied migration (root CLAUDE.md hard rules).
- `src/client.ts` — the single internal `PrismaClient`.
- `src/repositories/` — the public data-access surface, re-exported by `index.ts`.

The current schema holds only `health_jobs` — the S0 walking-skeleton table
(m0-kickoff §7). The product domain model (plan §4.5) lands in a follow-up
migration.

## Commands

```bash
pnpm --filter @masalai/db generate       # prisma generate (client)
pnpm --filter @masalai/db migrate        # prisma migrate dev (create + apply, dev)
pnpm --filter @masalai/db migrate:deploy # prisma migrate deploy (CI/prod)
pnpm --filter @masalai/db studio         # prisma studio
```

Requires `DATABASE_URL` (see `.env.example`) and the dev Postgres running
(`pnpm infra:up`).
