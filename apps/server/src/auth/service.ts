/**
 * Credentials, invites and password resets. The only place in the server that touches `auth.*`.
 * Rules from docs/TECH_SPEC.md "Auth" and docs/SECURITY.md.
 */

import { asApp, one } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { hashPassword, hashToken, newToken, verifyPassword, wastePasswordTime } from './passwords.js';
import { destroyAllSessions, type SessionUser } from './sessions.js';

/** The same message for a wrong address and a wrong password, so neither can be probed. */
export const SIGNIN_FAILED = 'Check your email address and password';
export const ACCOUNT_LOCKED =
  'Too many attempts. Your account is locked for 15 minutes.';
export const ACCOUNT_INACTIVE = 'Ask Raphy for access';

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  failed_logins: number;
  locked_until: Date | null;
}

interface ProfileRow {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'contributor' | 'viewer';
  timezone: string;
  active: boolean;
}

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const result = await asApp(async (client) => {
    const user = await one<UserRow>(
      client,
      `select id, email, password_hash, failed_logins, locked_until
         from auth.users where email = $1`,
      [email],
    );
    if (!user) return { kind: 'unknown' as const };

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      return { kind: 'locked' as const };
    }

    const ok = await verifyPassword(user.password_hash, password);
    if (!ok) {
      const failed = user.failed_logins + 1;
      await client.query(
        `update auth.users
            set failed_logins = $2,
                locked_until = case when $2 >= $3 then now() + ($4 || ' minutes')::interval else locked_until end
          where id = $1`,
        [user.id, failed, MAX_FAILED_LOGINS, String(LOCK_MINUTES)],
      );
      return { kind: failed >= MAX_FAILED_LOGINS ? ('locked' as const) : ('wrong' as const) };
    }

    const profile = await one<ProfileRow>(
      client,
      `select id, email, full_name as "fullName", role, timezone, active
         from public.profiles where id = $1`,
      [user.id],
    );
    if (!profile || !profile.active) return { kind: 'inactive' as const };

    await client.query(
      `update auth.users set failed_logins = 0, locked_until = null, last_sign_in_at = now()
        where id = $1`,
      [user.id],
    );
    const { active: _active, ...session } = profile;
    return { kind: 'ok' as const, user: session };
  });

  switch (result.kind) {
    case 'ok':
      return result.user;
    case 'locked':
      throw new HttpError(401, { error: 'signin', message: ACCOUNT_LOCKED });
    case 'inactive':
      throw new HttpError(403, { error: 'forbidden', message: ACCOUNT_INACTIVE });
    case 'unknown':
      // Keep the timing the same as a wrong password.
      await wastePasswordTime();
      throw new HttpError(401, { error: 'signin', message: SIGNIN_FAILED });
    default:
      throw new HttpError(401, { error: 'signin', message: SIGNIN_FAILED });
  }
}

export interface IssuedToken {
  token: string;
  link: string;
  expiresAt: Date;
}

/** Create an invite or reset token and return the link to email. */
export async function issueToken(
  userId: string,
  purpose: 'invite' | 'reset',
): Promise<IssuedToken> {
  const cfg = config();
  const hours = purpose === 'invite' ? cfg.INVITE_TOKEN_HOURS : cfg.RESET_TOKEN_HOURS;
  const token = newToken();

  const expiresAt = await asApp(async (client) => {
    // One live token per purpose: issuing a new one retires the old.
    await client.query(
      `delete from auth.tokens where user_id = $1 and purpose = $2 and used_at is null`,
      [userId, purpose],
    );
    const row = await one<{ expires_at: Date }>(
      client,
      `insert into auth.tokens (token_hash, user_id, purpose, expires_at)
       values ($1, $2, $3, now() + ($4 || ' hours')::interval)
       returning expires_at`,
      [hashToken(token), userId, purpose, String(hours)],
    );
    return row!.expires_at;
  });

  const path = purpose === 'invite' ? '/set-password' : '/reset';
  return { token, link: `${cfg.APP_URL}${path}?token=${token}`, expiresAt };
}

/** Spend a token and set the password. Used by both accept-invite and reset. */
export async function usePasswordToken(
  token: string,
  purpose: 'invite' | 'reset',
  password: string,
): Promise<SessionUser> {
  const hash = await hashPassword(password);

  const profile = await asApp(async (client) => {
    const row = await one<{ user_id: string }>(
      client,
      `update auth.tokens set used_at = now()
        where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
        returning user_id`,
      [hashToken(token), purpose],
    );
    if (!row) return undefined;

    await client.query(
      `update auth.users set password_hash = $2, failed_logins = 0, locked_until = null
        where id = $1`,
      [row.user_id, hash],
    );
    return one<ProfileRow>(
      client,
      `select id, email, full_name as "fullName", role, timezone, active
         from public.profiles where id = $1`,
      [row.user_id],
    );
  });

  if (!profile) {
    throw new HttpError(400, {
      error: 'invalid',
      fields: { token: 'That link has expired or has already been used' },
    });
  }
  if (!profile.active) {
    throw new HttpError(403, { error: 'forbidden', message: ACCOUNT_INACTIVE });
  }

  // Changing a password ends every other session (docs/SECURITY.md "Sessions").
  await destroyAllSessions(profile.id);

  const { active: _active, ...session } = profile;
  return session;
}

/**
 * Start a password reset. Always succeeds from the caller's point of view, so the route can
 * return 204 whether or not the address has an account.
 */
export async function startReset(email: string): Promise<IssuedToken | undefined> {
  const userId = await asApp(async (client) => {
    const row = await one<{ id: string }>(
      client,
      `select u.id from auth.users u
         join public.profiles p on p.id = u.id
        where u.email = $1 and p.active`,
      [email],
    );
    return row?.id;
  });
  if (!userId) return undefined;
  return issueToken(userId, 'reset');
}

/** Create the auth.users row and the profile for an invited person. */
export async function createUser(input: {
  email: string;
  fullName: string;
  role: 'admin' | 'contributor' | 'viewer';
  timezone: string;
  workDays?: number[];
  startDate?: string;
}): Promise<{ id: string }> {
  const cfg = config();
  const domain = input.email.split('@')[1] ?? '';
  if (cfg.allowedEmailDomains.length > 0 && !cfg.allowedEmailDomains.includes(domain)) {
    throw new HttpError(400, {
      error: 'invalid',
      fields: { email: `Use an address at ${cfg.allowedEmailDomains.join(' or ')}` },
    });
  }

  // `authenticated` has no insert on profiles, and gtm_app inherits that, so the account is
  // created through public.create_account() (db/migrations/0006). Only gtm_app may call it.
  return asApp(async (client) => {
    const row = await one<{ id: string }>(
      client,
      'select public.create_account($1, $2, $3, $4, $5::smallint[], $6::date) as id',
      [
        input.email,
        input.fullName,
        input.role,
        input.timezone,
        input.workDays ?? null,
        input.startDate ?? null,
      ],
    );
    return { id: row!.id };
  });
}

/** Deactivating someone must end their sessions straight away (AUTH-04). */
export async function deactivate(userId: string): Promise<void> {
  await destroyAllSessions(userId);
}
