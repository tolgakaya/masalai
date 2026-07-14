// Conventional-commit subject gate for the lefthook commit-msg hook.
// Kept in Node (not inline shell) so regex metacharacters need no shell quoting.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('commit-msg: no message file path passed');
  process.exit(2);
}

const subject = (readFileSync(file, 'utf8').split('\n')[0] ?? '').trim();
const pattern = /^(feat|fix|chore|docs|refactor|test|ci|build|perf|style|revert)(\(.+\))?!?: .+/;

if (!pattern.test(subject)) {
  console.error(
    `commit subject must be a conventional commit (e.g. "feat(api): ..."):\n  ${subject}`,
  );
  process.exit(1);
}
