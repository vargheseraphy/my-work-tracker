import type { FastifyInstance } from 'fastify';
import { schemas } from '@gtm/shared';
import { one, withUser } from '../db.js';
import { requireUser } from '../context.js';
import { sendMail } from '../mail/transport.js';
import { resetPasswordEmail } from '../mail/templates.js';
import {
  signIn,
  startReset,
  usePasswordToken,
} from './service.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
  type SessionUser,
} from './sessions.js';

/** The session shape the web app gets back, with the person's own "today". */
async function withToday(user: SessionUser): Promise<SessionUser & { today: string }> {
  const today = await withUser(user.id, async (client) => {
    const row = await one<{ today: string }>(client, 'select local_today($1) as today', [user.id]);
    return row!.today;
  });
  return { ...user, today };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request, reply) => {
    const body = schemas.loginBody.parse(request.body);
    const user = await signIn(body.email, body.password);
    const token = await createSession(user.id, request.headers['user-agent'], request.ip);
    setSessionCookie(reply, token);
    return { user: await withToday(user) };
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.sessionToken) await destroySession(request.sessionToken);
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/auth/me', async (request) => {
    const user = requireUser(request);
    return { user: await withToday(user) };
  });

  app.post('/auth/accept-invite', async (request, reply) => {
    const body = schemas.acceptInviteBody.parse(request.body);
    const user = await usePasswordToken(body.token, 'invite', body.password);
    const token = await createSession(user.id, request.headers['user-agent'], request.ip);
    setSessionCookie(reply, token);
    return { user: await withToday(user) };
  });

  // Always 204, so an address cannot be tested for an account (docs/SECURITY.md).
  app.post('/auth/forgot', async (request, reply) => {
    const body = schemas.forgotBody.parse(request.body);
    const issued = await startReset(body.email);
    if (issued) {
      const mail = resetPasswordEmail(body.email, issued.link);
      await sendMail(mail).catch((error: Error) =>
        request.log.error({ err: error.message }, 'reset email failed'),
      );
    }
    return reply.status(204).send();
  });

  app.post('/auth/reset', async (request, reply) => {
    const body = schemas.resetBody.parse(request.body);
    await usePasswordToken(body.token, 'reset', body.password);
    return reply.status(204).send();
  });
}
