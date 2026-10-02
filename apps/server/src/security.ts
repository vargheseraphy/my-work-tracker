/**
 * Security headers and the CSRF check, from docs/SECURITY.md "Headers" and "Controls".
 *
 * The Content-Security-Policy is applied to the API and to the production build only: in
 * development Vite serves the pages itself and needs inline scripts for hot reload.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { forbidden } from './errors.js';

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** Header a non-GET request must carry, so a cross-site form post cannot reach the API. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'gtm';

export function registerSecurity(app: FastifyInstance): void {
  const cfg = config();

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Content-Security-Policy', CSP);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (cfg.APP_URL.startsWith('https://')) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return payload;
  });
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Every non-GET /api request needs `X-Requested-With: gtm` and an Origin that matches APP_URL.
 * A browser will not let another site set that header on a cross-origin request.
 */
export function checkCsrf(request: FastifyRequest, _reply: FastifyReply): void {
  if (SAFE_METHODS.has(request.method)) return;

  const header = request.headers[CSRF_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  if (value !== CSRF_VALUE) throw forbidden();

  const origin = request.headers.origin;
  if (origin !== undefined && origin !== 'null') {
    const allowed = new Set([config().APP_URL, `http://localhost:${config().PORT}`]);
    const normalised = origin.replace(/\/$/, '');
    if (![...allowed].some((a) => a.replace(/\/$/, '') === normalised)) throw forbidden();
  }
}
