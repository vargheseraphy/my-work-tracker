/**
 * Who is making this request. Every /api route except the public auth ones needs a valid
 * session; admin routes need role admin, and a viewer may read the admin GET routes
 * (docs/SECURITY.md "Who can do what").
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, signinRequired } from './errors.js';
import { readSession, SESSION_COOKIE, type SessionUser } from './auth/sessions.js';
import { checkCsrf } from './security.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the session hook; undefined for anonymous requests. */
    currentUser?: SessionUser;
    sessionToken?: string;
  }
}

/** Routes that work without a session. */
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/accept-invite',
  '/api/auth/forgot',
  '/api/auth/reset',
  '/api/health',
]);

export function registerContext(app: FastifyInstance): void {
  // Read the session on every request, so even public routes know who is signed in.
  app.addHook('preHandler', async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    request.sessionToken = token;
    const user = await readSession(token);
    if (user) request.currentUser = user;
  });

  // CSRF, then the session requirement.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/api')) return;
    checkCsrf(request, reply);

    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_PATHS.has(path)) return;
    if (!request.currentUser) throw signinRequired();
  });
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.currentUser) throw signinRequired();
  return request.currentUser;
}

export function requireContributor(request: FastifyRequest): SessionUser {
  const user = requireUser(request);
  if (user.role === 'viewer') throw forbidden();
  return user;
}

export function requireAdmin(request: FastifyRequest): SessionUser {
  const user = requireUser(request);
  if (user.role !== 'admin') throw forbidden();
  return user;
}

/** Admin routes a viewer may read: GET only. */
export function requireAdminOrViewer(request: FastifyRequest): SessionUser {
  const user = requireUser(request);
  if (user.role === 'admin') return user;
  if (user.role === 'viewer' && request.method === 'GET') return user;
  throw forbidden();
}
