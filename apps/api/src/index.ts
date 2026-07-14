import { buildApp } from './app.js';
import { env } from './env.js';

const app = buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'api shutting down');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
