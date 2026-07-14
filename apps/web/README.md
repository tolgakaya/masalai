# @masalai/web

Next.js 16 (App Router) frontend. S0 ships a single placeholder page; the
night-first design system and the create-story wizard land in Stream C
(issue #4), built from docs/ux-design-plan.md.

## Run

```bash
pnpm --filter @masalai/web dev     # next dev on :3000
pnpm --filter @masalai/web build   # next build
```

Imports `@masalai/ui` (tokens + components) and `@masalai/shared` (API contract
schemas) only — never `@masalai/db` or vendor SDKs (dependency-cruiser enforced).
