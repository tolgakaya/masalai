import type { HealthJobPayload } from '@masalai/shared';
import { prisma } from '../client.js';

/** A persisted health-job row (the async-spine proof). */
export interface HealthJobRecord {
  readonly id: string;
  readonly requestId: string;
  readonly enqueuedAt: Date;
  readonly processedAt: Date;
}

/**
 * Persist a consumed health-job (called by the worker). Idempotent by primary
 * key: re-processing the same job id upserts rather than throwing, so BullMQ
 * retries are safe (root CLAUDE.md: all jobs idempotent).
 */
export async function upsertHealthJob(payload: HealthJobPayload): Promise<HealthJobRecord> {
  const enqueuedAt = new Date(payload.enqueuedAt);
  return prisma.healthJob.upsert({
    where: { id: payload.id },
    create: { id: payload.id, requestId: payload.requestId, enqueuedAt },
    update: { requestId: payload.requestId, enqueuedAt },
  });
}

/** Read a health-job row back (called by GET /internal/health-job/:id). */
export async function findHealthJobById(id: string): Promise<HealthJobRecord | null> {
  return prisma.healthJob.findUnique({ where: { id } });
}
