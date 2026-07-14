import { describe, expect, it } from 'vitest';
import {
  domainError,
  err,
  HEALTH_JOB_PAYLOAD_VERSION,
  HEALTH_JOB_QUEUE,
  type HealthJobPayload,
  healthJobPayloadSchema,
  isErr,
  isOk,
  ok,
  parseHealthJobPayload,
} from './index.js';

const valid: HealthJobPayload = {
  v: 1,
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  requestId: 'req_abc123',
  enqueuedAt: '2026-07-14T09:00:00Z',
};

describe('healthJobPayloadSchema', () => {
  it('accepts a well-formed v1 payload', () => {
    expect(parseHealthJobPayload(valid)).toEqual(valid);
  });

  it('rejects a wrong version', () => {
    expect(() => parseHealthJobPayload({ ...valid, v: 2 })).toThrow();
  });

  it('rejects a non-uuid id', () => {
    expect(() => parseHealthJobPayload({ ...valid, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects an empty requestId', () => {
    expect(() => parseHealthJobPayload({ ...valid, requestId: '' })).toThrow();
  });

  it('rejects a non-ISO enqueuedAt', () => {
    expect(() => parseHealthJobPayload({ ...valid, enqueuedAt: 'yesterday' })).toThrow();
  });

  it('rejects unknown keys (strict contract)', () => {
    expect(() => parseHealthJobPayload({ ...valid, extra: true })).toThrow();
  });

  it('binds the payload version to the shared constant', () => {
    expect(HEALTH_JOB_QUEUE).toBe('health.job');
    expect(healthJobPayloadSchema.parse(valid).v).toBe(HEALTH_JOB_PAYLOAD_VERSION);
  });
});

describe('Result + DomainError', () => {
  it('ok() wraps a value and narrows via isOk', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('err() wraps an error and narrows via isErr', () => {
    const result = err(domainError('NOT_FOUND', 'missing'));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('domainError() omits meta when absent, includes it when given', () => {
    expect(domainError('INTERNAL', 'boom')).toEqual({ code: 'INTERNAL', message: 'boom' });
    expect(domainError('VALIDATION_FAILED', 'bad', { field: 'id' })).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'bad',
      meta: { field: 'id' },
    });
  });
});
