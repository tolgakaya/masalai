import { buildRedisConnection, HEALTH_JOB_QUEUE } from '@masalai/shared';
import { Queue } from 'bullmq';
import { env } from './env.js';

/** Producer side of the health-job queue (the api enqueues; the worker consumes). */
export const healthJobQueue = new Queue(HEALTH_JOB_QUEUE, {
  connection: buildRedisConnection(env.REDIS_URL),
});
