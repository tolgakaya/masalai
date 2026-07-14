/**
 * Domain error + Result contract (engineering-handbook §6.2).
 *
 * Expected failures are values, not exceptions: services return
 * `Result<T, DomainError>` and the route layer maps `DomainError` → HTTP.
 */

/**
 * Closed union of error codes. These are API contract — apps/web switches on
 * them to pick UX copy, so a code's meaning NEVER changes once shipped. Add new
 * codes over time; never repurpose an existing one.
 */
export type ErrorCode =
  // Generic codes every service needs (incl. the health-job skeleton).
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'INTERNAL'
  // Domain codes named in engineering-handbook §6.2.
  | 'MODERATION_REJECTED'
  | 'INSUFFICIENT_CREDITS'
  | 'PROVIDER_RATE_LIMITED'
  | 'LIKENESS_BELOW_THRESHOLD';

/** A recoverable, typed failure. `meta` carries non-PII debugging context. */
export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly meta?: Record<string, unknown>;
}

/** Construct a `DomainError`, omitting `meta` entirely when absent. */
export function domainError(
  code: ErrorCode,
  message: string,
  meta?: Record<string, unknown>,
): DomainError {
  // exactOptionalPropertyTypes: omit the key rather than set it to `undefined`.
  return meta === undefined ? { code, message } : { code, message, meta };
}

/** Successful branch of a {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed branch of a {@link Result}. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Hand-rolled Result type (engineering-handbook §6.2). Defaults the error
 * channel to {@link DomainError}; pass a narrower `E` when useful.
 */
export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}
