# MasalAI — Governing Document Set (final, consistency-reviewed)
Packaged 2026-07-12. Copy this folder into the repo as `docs/` (file names are already the repo-target names referenced by CLAUDE.md and the kickoff prompts).

| File | Role |
|---|---|
| plan.md | Product, architecture, security, business plan (v2 + sprint edition §17, MoR payments) |
| engineering-handbook.md | Stack/versions, repo rules, git/PR/CI-CD, coding & DB standards |
| claude-code-protocol.md | Context-loss resilience, STATE/DECISIONS discipline, §12 parallel-session mode |
| ux-design-plan.md | Night-first design system, tokens, screen specs, content design |
| marketing-plan.md | 90-day sprint-edition program + 12-month strategy (₺100k budget, EN-first global) |
| ai-provider-scale-architecture.md | Queue topology (BullMQ, ADR-0006), provider router, failover/breaker, Railway scale |
| m0-kickoff.md | Day-1 prep + both Day-1 Claude Code prompts (SuperClaude edition) |
| reference/AI_PROVIDER_SCALE_ARCHITECTURE.md | ZiraAI reference architecture (source material, unchanged) |

Cross-reference integrity: plan §4.4→ai-provider-scale-architecture; plan §7.4→marketing-plan (superseded note); protocol §7 Doc-Touch Matrix includes ux & scale docs; kickoff reads all of the above. Start here: m0-kickoff.md §A.
