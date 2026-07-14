import { upsertHealthJob } from '@masalai/db';
import { buildRedisConnection, HEALTH_JOB_QUEUE, parseHealthJobPayload } from '@masalai/shared';
import { Worker } from 'bullmq';
import { env } from './env.js';
import { logger } from './logger.js';

const connection = {
  ...buildRedisConnection(env.REDIS_URL),
  // BullMQ workers require this to be null.
  maxRetriesPerRequest: null,
};

/**
 * Consumer side of the walking skeleton (m0-kickoff §7): parse the payload
 * against the shared contract, upsert the row (idempotent), and log with the
 * propagated requestId so the api→queue→worker hop is traceable.
 */
const worker = new Worker(
  HEALTH_JOB_QUEUE,
  async (job) => {
    const payload = parseHealthJobPayload(job.data);
    const row = await upsertHealthJob(payload);
    logger.info({ healthJobId: row.id, requestId: payload.requestId }, 'health-job processed');
  },
  { connection },
);

worker.on('ready', () => logger.info({ queue: HEALTH_JOB_QUEUE }, 'worker ready'));
worker.on('failed', (job, err) =>
  logger.error({ jobId: job?.id, err: err.message }, 'health-job failed'),
);

// Graceful shutdown: stop taking jobs, finish in-flight, then exit (handbook §5.3).
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
