#!/usr/bin/env node
// Stop hook (protocol §8.3): gentle reminder — if code changed this session but STATE.md was not
// touched, nudge to update it. Warning only, never blocks (always exits 0).
import { execSync } from 'node:child_process';

try {
  const status = execSync('git status --short', { encoding: 'utf8', timeout: 5000 });
  const lines = status
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/\\/g, '/'));
  const codeChanged = lines.some((f) => /^(apps|packages)\//.test(f));
  const stateTouched = lines.some((f) => f.startsWith('docs/state/STATE.md'));
  if (codeChanged && !stateTouched) {
    console.error(
      'Reminder (protocol §4.2): code changed but docs/state/STATE.md is untouched. ' +
        'Update Done:/NOW: before ending, or run /checkpoint.',
    );
  }
} catch {
  // ignore
}
process.exit(0);
