Record an open question (protocol §3.1, §6.1). Argument: the question text.

1. Append to `docs/state/QUESTIONS.md`:
   `YYYY-MM-DD | #n | <question> | <forbidden-guess domain? which> | blocks: <task/issue>`.
2. Comment the question on the active GitHub issue (`gh issue comment <n> --body ...`) so it is
   readable from anywhere, not just this disk.
3. Suggest a non-blocked step I can authorize instead, so the session stays productive while the
   question is open. Do NOT guess the answer to proceed — an unanswered forbidden-guess question
   blocks its dependent task until I answer.

When I later answer, move the item into DECISIONS.md with the answer (keep the QUESTIONS line,
annotate `→ answered DECISIONS YYYY-MM-DD`).
