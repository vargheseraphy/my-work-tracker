/**
 * The Fastify app factory. Tests build the app with this and call it through `fastify.inject`,
 * so nothing has to listen on a port.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { registerErrorHandler } from './errors.js';
import { registerSecurity } from './security.js';
import { registerContext } from './context.js';
import { authRoutes } from './auth/routes.js';
import { entriesRoutes } from './entries/routes.js';
import { filesRoutes } from './files/routes.js';
import { tasksRoutes } from './tasks/routes.js';
import { abmRoutes } from './abm/routes.js';
import { notificationsRoutes } from './notifications/routes.js';
import { adminRoutes } from './admin/routes.js';
import { homeRoutes } from './home/routes.js';
import { reportRoutes } from './report/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = config();

  const app = Fastify({
    logger: {
      level: cfg.isTest ? 'silent' : cfg.LOG_LEVEL,
      // Never log a password, token or cookie (docs/SECURITY.md "Logs").
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body.password',
          'req.body.token',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
      ...(cfg.isProduction || cfg.isTest
        ? {}
        : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }),
    },
    bodyLimit: 1_048_576,
    trustProxy: false,
    disableRequestLogging: cfg.isTest,
  });

  await app.register(cookie, { secret: cfg.SESSION_SECRET });

  await app.register(multipart, {
    limits: { fileSize: cfg.MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  });

  await app.register(rateLimit, {
    global: false,
    // The whole machine is one person locally, so keep the limit generous outside auth.
    max: 600,
    timeWindow: '1 minute',
  });

  registerSecurity(app);
  registerErrorHandler(app);
  registerContext(app);

  app.get('/api/health', async () => ({ ok: true }));

  // Auth routes carry their own, much tighter limit (docs/TECH_SPEC.md "Auth").
  await app.register(
    async (instance) => {
      await instance.register(rateLimit, {
        max: 20,
        timeWindow: '15 minutes',
        keyGenerator: (request) => request.ip,
      });
      await authRoutes(instance);
    },
    { prefix: '/api' },
  );

  await app.register(homeRoutes, { prefix: '/api' });
  await app.register(entriesRoutes, { prefix: '/api' });
  await app.register(filesRoutes, { prefix: '/api' });
  await app.register(tasksRoutes, { prefix: '/api' });
  await app.register(abmRoutes, { prefix: '/api' });
  await app.register(notificationsRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api' });
  await app.register(reportRoutes, { prefix: '/api' });

  return app;
}
