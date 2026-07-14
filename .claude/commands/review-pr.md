Fresh-session PR review (handbook §11.4, protocol §8.2). Argument: the PR number.

Review with no author bias — you did NOT write this. Run `gh pr diff <n>` and check against the
handbook. Report findings grouped by severity (blocking / should-fix / nit), each citing a file:line
and the doc rule it violates. Verify specifically:

1. **Tenancy**: every DB query / repository call scoped by userId; new asset/story route has a
   cross-tenant IDOR test proving foreign-user access fails (handbook §7, §16).
2. **Error handling**: services return Result<T, DomainError>; ErrorCode used from shared/errors.ts;
   no silent `catch {}`; no stack/SQL/provider bodies leaked to clients (handbook §6.3).
3. **DB changes**: expand→contract only; generated SQL pasted in PR; no edits to applied migrations (§5.6, §7).
4. **Logging hygiene**: no photo/signed URLs, keys, or child names in logs; correct pino levels;
   requestId present (handbook §6.5).
5. **Contracts**: API/queue changes went through packages/shared zod schemas; queue payloads carry `v`.
6. **Doc-Touch Matrix** (protocol §7): the change updated every doc its row requires (DECISIONS.md always).
7. **Evidence**: "done"/"tested" claims backed by freshly-run output, not narrative (protocol §6.2).
8. **Scope**: ≤ 400 changed LOC excl. lockfile/generated; no drive-by unrelated changes.

End with an explicit verdict: APPROVE / REQUEST CHANGES, and the top 3 must-fix items if any.
