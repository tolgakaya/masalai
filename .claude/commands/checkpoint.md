Create a checkpoint (protocol §4.2) — do this after every completed green sub-step, not at the end:

1. Run `pnpm check` (or the narrowest relevant scope, e.g. `pnpm test --filter <pkg>`); proceed
   only if green. If red, stop and fix or record in STATE.md `NOW:`.
2. Stage and commit the current work with a conventional-commit message
   (`wip(<scope>): ...` is fine on a branch — squash-merge erases it from main history).
3. Update `docs/state/STATE.md`: move the finished item to `Done:` (with the commit sha) and
   set `NOW:` to the single next concrete action a zero-context session could execute.
4. Reply with a one-line summary: what was committed + what `NOW:` points to next.
