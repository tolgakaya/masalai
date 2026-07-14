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

The schema holds the plan §4.5 product domain (users, characters, assets,
stories, story_pages, story_characters, jobs, credits_ledger, subscriptions,
audit_log) plus the internal `health_jobs` walking-skeleton table (m0-kickoff §7).
Lifecycle fields are Postgres enums; content/config fields (`art_style`,
`locale`, `language`) are String validated app-side (DECISIONS 2026-07-14).

Repositories for user-scoped entities take `userId` first and read via
`findFirst({ id, userId })` so one user can never fetch another's row (IDOR).

## Commands

```bash
pnpm --filter @masalai/db generate       # prisma generate (client)
pnpm --filter @masalai/db migrate        # prisma migrate dev (create + apply, dev)
pnpm --filter @masalai/db migrate:deploy # prisma migrate deploy (CI/prod)
pnpm --filter @masalai/db studio         # prisma studio
```

Requires `DATABASE_URL` (see `.env.example`) and the dev Postgres running
(`pnpm infra:up`).
