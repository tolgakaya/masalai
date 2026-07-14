import { z } from 'zod';
import { HEALTH_JOB_PAYLOAD_VERSION } from './constants.js';

/**
 * health-job queue payload — the api → queue → worker contract for the walking
 * skeleton (m0-kickoff §7): `POST /internal/health-job` enqueues this payload,
 * the worker consumes it and writes a row, and `GET /internal/health-job/:id`
 * reads it back.
 *
 * `strictObject`: an unknown key is a contract violation, not silently dropped.
 */
export const healthJobPayloadSchema = z.strictObject({
  /** Payload version — see {@link HEALTH_JOB_PAYLOAD_VERSION} (handbook §5.6). */
  v: z.literal(HEALTH_JOB_PAYLOAD_VERSION),
  /** Health-job entity id: the row the worker writes and the GET route reads. */
  id: z.uuid(),
  /**
   * Request correlation id, propagated api → queue → worker logs so an async
   * round-trip can be traced end to end (engineering-handbook §6.4).
   */
  requestId: z.string().min(1),
  /** When the api enqueued the job (ISO 8601, UTC). */
  enqueuedAt: z.iso.datetime(),
});

/** Typed health-job payload, inferred from {@link healthJobPayloadSchema}. */
export type HealthJobPayload = z.infer<typeof healthJobPayloadSchema>;

/**
 * Parse unknown queue data into a typed {@link HealthJobPayload}.
 * Throws `ZodError` on any contract violation.
 */
export function parseHealthJobPayload(data: unknown): HealthJobPayload {
  return healthJobPayloadSchema.parse(data);
}
