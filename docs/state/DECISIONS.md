# DECISIONS — append-only log (protocol §3.3)

> Format: `YYYY-MM-DD | decision | why | links`. Never edit/delete a line (protocol §8.4);
> promoted entries get ` | promoted → ADR-xxxx` appended. Small decisions live here; big ones become ADRs.

2026-07-14 | Pin toolchain to handbook §2.1 baseline MAJORS, newest minor within: TS 5.9.3 (not 7.x), pnpm 10.34.5 (not 11), Prisma 6.19.3 (not 7), pino 9.14.0 (not 10), Vitest 3.2.7 (not 4) | handbook §2.2 "never day-one majors"; newer majors revisited via ADR later | handbook §2.1/§2.2, issue #1
2026-07-14 | Non-baseline pins at their latest (aligned): Next 16.2.10, React 19.2.7, Fastify 5.10.0, fastify-type-provider-zod 7.0.0, zod 4.4.3, BullMQ 5.80.2, Better Auth 1.6.23, Biome 2.5.3, Tailwind 4.3.2 (deferred, ui empty) | match handbook baseline majors, verified via `npm show` | handbook §2.1
2026-07-14 | pnpm activated via Corepack (`corepack prepare pnpm@10.34.5 --activate`), pinned in package.json `packageManager` | handbook §2.1 (Corepack), reproducible across local/CI/Railway | —
2026-07-14 | `.serena/` gitignored at repo root (Serena IDE cache, not project source) | low-stakes housekeeping; keeps repo clean | protocol §5.2
2026-07-14 | packages/db uses Prisma classic `prisma-client-js` generator (default node_modules output), imported as `@prisma/client`, NOT the new EA `prisma-client` (output-into-src) generator | new generator emits .ts into src → fights strict tsc (noUnusedLocals) + NodeNext resolution; classic output stays out of typecheck/lint. Revisit via ADR when Prisma 7 forces the new generator | Prisma 6.6 changelog, handbook §6.1
2026-07-14 | pnpm `onlyBuiltDependencies` allowlist in root package.json: @prisma/client, @prisma/engines, prisma, esbuild, lefthook | pnpm 10 blocks postinstall build scripts by default; Prisma needs its engine binaries. Explicit committed allowlist = reproducible across local/CI (vs interactive `pnpm approve-builds`) | pnpm 10 build-script policy
