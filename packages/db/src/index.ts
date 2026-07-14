/**
 * @masalai/db — Prisma schema, client, and userId-first repositories. Apps import
 * repositories from here and never touch Prisma directly (engineering-handbook §7).
 * May depend on @masalai/shared; nothing else internal (§3.1).
 */

export type { HealthJobRecord } from './repositories/health-job.repository.js';
export { findHealthJobById, upsertHealthJob } from './repositories/health-job.repository.js';
