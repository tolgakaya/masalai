Execute the session-start ritual (protocol §4.1) verbatim:

1. Read `docs/state/STATE.md` and the active issue (CLAUDE.md is auto-loaded).
2. Run `git status && git log --oneline -10 && gh pr status` — reconcile reality vs STATE.md.
   **Git wins** if they disagree; fix STATE.md first before doing anything else.
3. Run `pnpm check` to establish a known-green (or known-red) baseline. If red, record it in
   STATE.md `NOW:` and treat fixing it as the first action.
4. Read ONLY the docs sections the active issue points to (Definition of Ready requires them).
   Route bulk exploration to a subagent (protocol §5.3), never into this context.
5. Restate the task + acceptance criteria + the STATE.md `NOW:` action in one short message,
   then WAIT for my confirmation before writing any code.
