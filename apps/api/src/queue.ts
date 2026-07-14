import { HEALTH_JOB_QUEUE } from '@masalai/shared';
import { Queue } from 'bullmq';
import { env } from './env.js';

const redisUrl = new URL(env.REDIS_URL);

/** BullMQ connection derived from REDIS_URL (shared by producer here and the worker). */
export const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  ...(redisUrl.password ? { password: redisUrl.password } : {}),
};

/** Producer side of the health-job queue (the api enqueues; the worker consumes). */
export const healthJobQueue = new Queue(HEALTH_JOB_QUEUE, { connection: redisConnection });
