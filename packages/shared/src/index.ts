/**
 * @masalai/shared — the single home for cross-boundary contracts (zod schemas,
 * derived types, constants, error codes). Depends on nothing internal
 * (engineering-handbook §3.1).
 */

export { HEALTH_JOB_PAYLOAD_VERSION, HEALTH_JOB_QUEUE } from './constants.js';
export type { DomainError, Err, ErrorCode, Ok, Result } from './errors.js';
export {
  domainError,
  err,
  isErr,
  isOk,
  ok,
} from './errors.js';
export type { HealthJobPayload } from './health-job.js';
export { healthJobPayloadSchema, parseHealthJobPayload } from './health-job.js';
