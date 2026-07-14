import { randomUUID } from 'node:crypto';
import { fastify } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { env } from './env.js';
import { healthRoutes } from './routes/health.js';

/** Build the Fastify app with the zod type provider wired in. */
export function buildApp() {
  const app = fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // Never log secrets: redact auth/cookie headers (root CLAUDE.md logging rule).
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    // Accept an inbound correlation id or mint one; req.id becomes the requestId.
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(healthRoutes);

  return app;
}
