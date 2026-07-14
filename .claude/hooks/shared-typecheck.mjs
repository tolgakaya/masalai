#!/usr/bin/env node
// PostToolUse(Edit|Write|MultiEdit) hook (protocol §8.3): when a file under packages/shared changes,
// typecheck that package immediately — contract files must fail fast. Gracefully skips until the
// package has a `typecheck` script wired. Surfaces failures to Claude via exit code 2.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }

const fp = (payload.tool_input?.file_path || payload.tool_input?.path || '').replace(/\\/g, '/');
if (!fp.includes('packages/shared/')) process.exit(0);
if (!existsSync('packages/shared/package.json')) process.exit(0);

// Only run if a typecheck script exists, else skip silently (bootstrap phase).
try {
  const pkg = JSON.parse(readFileSync('packages/shared/package.json', 'utf8'));
  if (!pkg.scripts?.typecheck) process.exit(0);
} catch { process.exit(0); }

try {
  execSync('pnpm --filter @masalai/shared typecheck', { encoding: 'utf8', timeout: 9000, stdio: 'pipe' });
  process.exit(0);
} catch (e) {
  const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
  console.error(`packages/shared typecheck failed (contract fail-fast):\n${out.slice(-1500)}`);
  process.exit(2); // non-zero surfaces stderr to Claude
}
