#!/usr/bin/env node
// PreCompact hook (protocol §8.3): append a timestamped auto-checkpoint breadcrumb to STATE.md,
// so a compaction is a non-event even if the /checkpoint ritual was missed. Must be fast + non-fatal.
import { execSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';

const STATE = 'docs/state/STATE.md';
try {
  if (!existsSync(STATE)) process.exit(0);
  const sh = (c) => {
    try {
      return execSync(c, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch {
      return '';
    }
  };
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
  const branch = sh('git rev-parse --abbrev-ref HEAD') || '(detached)';
  const last = sh('git log --oneline -1') || '(no commits)';
  const status = sh('git status --short');
  const dirty = status ? status.split('\n').length : 0;
  const line =
    `\n<!-- AUTO-CHECKPOINT before compaction @ ${stamp} · branch ${branch} · ` +
    `last: ${last} · ${dirty} uncommitted file(s) -->\n`;
  appendFileSync(STATE, line);
} catch {
  // never block compaction
}
process.exit(0);
