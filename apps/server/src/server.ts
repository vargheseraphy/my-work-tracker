/** The process entry point: load .env, build the app, start listening, start the scheduler. */

import { mkdir } from 'node:fs/promises';
import { buildApp } from './app.js';
import { config, loadDotEnv } from './config.js';
import { closePool } from './db.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

loadDotEnv();

const cfg = config();
await mkdir(cfg.uploadDir, { recursive: true });

const app = await buildApp();
await app.listen({ port: cfg.PORT, host: '127.0.0.1' });
startScheduler(app.log);

app.log.info(`API on http://localhost:${cfg.PORT} · web on ${cfg.APP_URL}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      stopScheduler();
      await app.close();
      await closePool();
      process.exit(0);
    })();
  });
}
