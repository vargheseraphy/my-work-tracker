/**
 * Sessions live in auth.sessions, keyed by the sha256 of the cookie's token.
 * 12 hours idle, 7 days absolute (docs/TECH_SPEC.md "Auth").
 */

import type { FastifyReply } from 'fastify';
// Brings in the cookie decorators @fastify/cookie adds to the request and reply.
import type {} from '@fastify/cookie';
import { asApp, one } from '../db.js';
import { config } from '../config.js';
import { hashToken, newToken } from './passwords.js';

export const SESSION_COOKIE = 'gtm_session';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'contributor' | 'viewer';
  timezone: string;
}

interface SessionRow extends SessionUser {
  last_seen_at: Date;
}

export async function createSession(
  userId: string,
  userAgent: string | undefined,
  ip: string | undefined,
): Promise<string> {
  const token = newToken();
  const cfg = config();
  await asApp(async (client) => {
    await client.query(
      `insert into auth.sessions (id, user_id, expires_at, user_agent, ip)
       values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
      [hashToken(token), userId, String(cfg.SESSION_MAX_DAYS), userAgent?.slice(0, 300) ?? null, ip ?? null],
    );
  });
  return token;
}

/**
 * Look a session up and return the person, or undefined when it is missing, expired, idle too
 * long, or the profile has been deactivated. `last_seen_at` is refreshed at most once a minute.
 */
export async function readSession(token: string): Promise<SessionUser | undefined> {
  const cfg = config();
  const id = hashToken(token);

  return asApp(async (client) => {
    // auth_profile() is a SECURITY DEFINER function (migration 0007): row-level security hides
    // profiles from gtm_app, and a session has to be read before there is a user context.
    const row = await one<SessionRow>(
      client,
      `select p.id, p.email, p.full_name as "fullName", p.role, p.timezone, s.last_seen_at
         from auth.sessions s
         cross join lateral public.auth_profile(s.user_id) p
        where s.id = $1
          and s.expires_at > now()
          and s.last_seen_at > now() - ($2 || ' hours')::interval
          and p.active`,
      [id, String(cfg.SESSION_IDLE_HOURS)],
    );
    if (!row) return undefined;

    if (Date.now() - row.last_seen_at.getTime() > 60_000) {
      await client.query('update auth.sessions set last_seen_at = now() where id = $1', [id]);
    }
    const { last_seen_at: _lastSeen, ...user } = row;
    return user;
  });
}

export async function destroySession(token: string): Promise<void> {
  await asApp(async (client) => {
    await client.query('delete from auth.sessions where id = $1', [hashToken(token)]);
  });
}

/** Used when a password changes or an account is deactivated (docs/SECURITY.md "Sessions"). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await asApp(async (client) => {
    await client.query('delete from auth.sessions where user_id = $1', [userId]);
  });
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  const cfg = config();
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: cfg.isProduction,
    maxAge: cfg.SESSION_MAX_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
