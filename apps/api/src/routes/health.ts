import { randomUUID } from 'node:crypto';
import { findHealthJobById } from '@masalai/db';
import {
  HEALTH_JOB_PAYLOAD_VERSION,
  HEALTH_JOB_QUEUE,
  healthJobPayloadSchema,
} from '@masalai/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { healthJobQueue } from '../queue.js';

const healthJobView = z.object({
  id: z.uuid(),
  requestId: z.string(),
  enqueuedAt: z.iso.datetime(),
  processedAt: z.iso.datetime(),
});

const notFound = z.object({
  code: z.literal('NOT_FOUND'),
  message: z.string(),
});

/**
 * Walking-skeleton routes (m0-kickoff §7): POST enqueues a health-job, the
 * worker consumes it and writes a row, GET reads it back. `requestId` is carried
 * api → queue → worker so an async round-trip can be traced end to end.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get('/health', async () => ({ status: 'ok' as const }));

  fastify.route({
    method: 'POST',
    url: '/internal/health-job',
    schema: {
      response: { 202: z.object({ id: z.uuid() }) },
    },
    handler: async (req, reply) => {
      const id = randomUUID();
      const payload = healthJobPayloadSchema.parse({
        v: HEALTH_JOB_PAYLOAD_VERSION,
        id,
        requestId: String(req.id),
        enqueuedAt: new Date().toISOString(),
      });
      // Deterministic jobId → enqueue is idempotent under retry.
      await healthJobQueue.add(HEALTH_JOB_QUEUE, payload, {
        jobId: id,
        removeOnComplete: true,
        removeOnFail: 100,
      });
      req.log.info({ healthJobId: id, requestId: payload.requestId }, 'health-job enqueued');
      return reply.code(202).send({ id });
    },
  });

  fastify.route({
    method: 'GET',
    url: '/internal/health-job/:id',
    schema: {
      params: z.object({ id: z.uuid() }),
      response: { 200: healthJobView, 404: notFound },
    },
    handler: async (req, reply) => {
      const row = await findHealthJobById(req.params.id);
      if (!row) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'health-job not found' });
      }
      return reply.send({
        id: row.id,
        requestId: row.requestId,
        enqueuedAt: row.enqueuedAt.toISOString(),
        processedAt: row.processedAt.toISOString(),
      });
    },
  });
};
