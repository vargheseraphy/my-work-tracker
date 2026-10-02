/**
 * Turning errors into the responses docs/TECH_SPEC.md "Errors" promises.
 *
 * | Source                                   | HTTP | Body                                  |
 * | zod validation                           | 400  | {error:'invalid', fields:{...}}       |
 * | no session                               | 401  | {error:'signin'}                      |
 * | Postgres 42501 or an RLS refusal         | 403  | {error:'forbidden'}                   |
 * | a rule raised in a function (P0001)      | 409  | {error:'rule', message}               |
 * | not found or not visible                 | 404  | {error:'not_found'}                   |
 * | anything else                            | 500  | {error:'server'}                      |
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly body: Record<string, unknown>,
  ) {
    super(typeof body.message === 'string' ? body.message : String(body.error));
    this.name = 'HttpError';
  }
}

export const signinRequired = (): HttpError => new HttpError(401, { error: 'signin' });
export const forbidden = (): HttpError => new HttpError(403, { error: 'forbidden' });
export const notFound = (): HttpError => new HttpError(404, { error: 'not_found' });
export const invalid = (fields: Record<string, string>): HttpError =>
  new HttpError(400, { error: 'invalid', fields });
export const ruleError = (message: string): HttpError =>
  new HttpError(409, { error: 'rule', message });

interface PostgresError extends Error {
  code?: string;
  constraint?: string;
  table?: string;
}

function isPostgresError(error: unknown): error is PostgresError {
  return error instanceof Error && typeof (error as PostgresError).code === 'string';
}

/** zod's issue list, flattened into one message per field path. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Map any thrown value to a status and a body. Details of a 500 never leave the server;
 * they go to the log instead (docs/SECURITY.md "Logs").
 */
export function toResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof HttpError) {
    return { status: error.statusCode, body: error.body };
  }

  if (error instanceof ZodError) {
    return { status: 400, body: { error: 'invalid', fields: fieldErrors(error) } };
  }

  if (isPostgresError(error)) {
    switch (error.code) {
      // A rule raised with `raise exception` inside a database function.
      case 'P0001':
        return { status: 409, body: { error: 'rule', message: error.message } };
      // insufficient_privilege: a grant or a SECURITY DEFINER guard refused.
      case '42501':
        return { status: 403, body: { error: 'forbidden' } };
      // A row-level security policy refused an insert or update.
      case '425010':
        return { status: 403, body: { error: 'forbidden' } };
      // check constraint, not null, foreign key, unique: the request asked for something invalid.
      case '23514':
      case '23502':
      case '23503':
        return { status: 400, body: { error: 'invalid', fields: { _: 'That value is not allowed' } } };
      case '23505':
        return { status: 409, body: { error: 'rule', message: 'That already exists' } };
      case '22P02':
      case '22007':
        return { status: 400, body: { error: 'invalid', fields: { _: 'That value is not valid' } } };
      default:
        break;
    }
    // Postgres words an RLS refusal as a message, not a distinct code.
    if (/row-level security policy/i.test(error.message)) {
      return { status: 403, body: { error: 'forbidden' } };
    }
    if (/permission denied/i.test(error.message)) {
      return { status: 403, body: { error: 'forbidden' } };
    }
  }

  return { status: 500, body: { error: 'server' } };
}

/** The single error handler every route falls back to. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // Fastify's own validation and body-size errors.
    if (error.statusCode === 413) {
      return reply.status(413).send({ error: 'invalid', fields: { file: 'That file is too large' } });
    }
    if (error.statusCode === 429) {
      return reply
        .status(429)
        .send({ error: 'too_many', message: 'Too many attempts. Try again in a few minutes.' });
    }

    const { status, body } = toResponse(error);
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
    } else {
      request.log.info({ err: error.message, status }, 'request refused');
    }
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => reply.status(404).send({ error: 'not_found' }));
}
