# ADR-0004 — Lint/format: Biome

- Status: Accepted
- Date: 2026-07-14
- Deciders: Tolga
- Context refs: plan §8.4, engineering-handbook §2.1/§6.2

## Context
We want one fast, low-config tool for both linting and formatting across the
monorepo, plus the ability to encode repo-specific rules (vendor-SDK containment,
cross-module deep-import blocking) that the architecture depends on.

## Decision
Use **Biome** (pinned 2.5.3) as the single lint + format tool. One `biome.json`
at the root: recommended rules, `noExplicitAny` as error, import sorting on, and
`noRestrictedImports` to keep vendor SDKs inside `packages/providers`. `pnpm
format` writes; CI checks only. (Next.js uses Biome, not ESLint — `eslint:
ignoreDuringBuilds`.)

## Consequences
- (+) One tool, near-instant runs -> keeps `pnpm check` fast and the small-PR culture alive.
- (+) Architectural rules (vendor containment) enforced by the formatter/linter, backed by dependency-cruiser.
- (−) Smaller plugin ecosystem than ESLint; some niche rules may be unavailable.
- (−) Biome and Next.js each rewrite tsconfig.json/generated files; we accept the occasional reformat churn.
