Execute the cold-recovery procedure (protocol §4.5). Target: < 5 minutes to productive.

1. `cat docs/state/STATE.md` — the intended state.
2. `git status; git log --oneline -15` — the actual state. **Actual wins** on any conflict.
3. `gh pr status; gh issue list --label prio:p0` — external state.
4. `pnpm check` — the executable truth.
5. Reconcile: fix STATE.md to match reality, then report to me — in a short message — every
   discrepancy you found between STATE.md and git/CI BEFORE resuming. Resume from the corrected
   `NOW:` only after you've surfaced the discrepancies.

Treat any pre-compaction memory of file contents as false: re-read a file before editing it.
