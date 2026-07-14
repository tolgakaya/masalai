Execute the session-end ritual (protocol §4.3):

1. Run `pnpm check`. If green, commit; if red, do NOT hide it — write the exact failing
   test/step into STATE.md `NOW:` (e.g. `NOW: fix failing test X in <file>`).
2. Update `docs/state/STATE.md` fully (Done/NOW, INTEGRATION block if merges pending) and
   write today's `docs/sessions/YYYY-MM-DD-<slug>.md` log (template protocol §9.2).
3. Push the branch and open/update the PR (draft is fine). Unpushed work is not "saved".
4. If the task is incomplete, output the issue handoff block (protocol §9.3) for me to paste
   as a comment on the active issue:

```md
⏸ Parked at: <NOW: line> · Branch <branch> pushed, PR #<n> draft
Green: pnpm check ✅ (or: red — failing test X, cause hypothesis Y)
Resume: /start on #<issue> — STATE.md is current as of this comment.
```

Then remind me to run `/sc:save`.
