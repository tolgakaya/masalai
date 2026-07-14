<!-- PR title MUST be a conventional commit, e.g. `feat(api): add health-job route`. -->

## What & why
<!-- 1–3 sentences. Link the issue: Closes #NN -->

## How to verify
<!-- exact steps or test names a reviewer runs -->

## Checklist
- [ ] `pnpm check` green locally
- [ ] Tests added/updated for new behavior
- [ ] Scope ≤ 400 changed LOC (excl. lockfile/generated); larger work sliced behind a flag
- [ ] Every DB query scoped by `user_id`; cross-tenant IDOR test added for new asset/story routes
- [ ] DB change is expand→contract; generated migration SQL pasted below (or N/A)
- [ ] New env var → `.env.example` + `apps/<x>/src/env.ts` updated together (or N/A)
- [ ] No vendor SDK outside `packages/providers`
- [ ] Jobs idempotent; payloads carry `v`; no photo/signed-URL/child-name in logs (or N/A)
- [ ] Doc-Touch Matrix docs updated (protocol §7); DECISIONS/ADR updated if a decision was made
- [ ] Cost impact: none / est. $__/story · Privacy impact: none / described below

## Migration SQL
<!-- paste `prisma migrate` generated SQL, or "none" -->
