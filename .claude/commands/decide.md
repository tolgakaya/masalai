Append a decision to `docs/state/DECISIONS.md` (protocol §3.3). Argument: the decision text.

1. Format one append-only line: `YYYY-MM-DD | <decision> | <why> | <links: #issue, PR, doc §>`.
   Use today's date from the environment context (never guess the date — protocol / temporal rule).
2. Append it to `docs/state/DECISIONS.md`. NEVER edit or reorder existing lines (protocol §8.4).
3. If the decision changes product/architecture, note that it should be promoted to plan.md or an
   ADR in the weekly review (append ` | promoted → ADR-xxxx` later; never delete the line).
4. Echo the exact line back to me so I can confirm it was captured.

If the decision is in a forbidden-guess domain (prices/credits, consent/privacy, retention,
moderation thresholds, provider choice, user-facing TR copy), STOP: it needs my explicit sign-off
first — use /question instead.
