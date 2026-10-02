/**
 * Shared test helpers.
 *
 * Each file starts from an empty database, then invents the people it needs. Test users get
 * work_days {1..7} unless a test is about weekends, so results never depend on the day the
 * suite happens to run (docs/TESTING.md "Database tests").
 */

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions } from 'fastify';
import argon2 from 'argon2';
import pg from 'pg';
import { buildApp } from '../app.js';
import { closePool, withUser, type PoolClient } from '../db.js';
import { SESSION_COOKIE } from '../auth/sessions.js';

export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export const TEST_PASSWORD = 'correct-horse-battery';

export interface TestUser {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'contributor' | 'viewer';
  timezone: string;
}

let ownerClient: pg.Client | undefined;

/** A connection as the owner role, for arranging state a web request could not create. */
export async function owner(): Promise<pg.Client> {
  if (!ownerClient) {
    const url = process.env.DATABASE_URL_OWNER_TEST;
    if (!url) throw new Error('DATABASE_URL_OWNER_TEST is not set');
    ownerClient = new pg.Client({ connectionString: url });
    await ownerClient.connect();
  }
  return ownerClient;
}

export async function closeOwner(): Promise<void> {
  if (ownerClient) {
    const client = ownerClient;
    ownerClient = undefined;
    await client.end();
  }
  await closePool();
}

/** Empty every table that holds test data, keeping the reference data from migration 0004. */
export async function resetDatabase(): Promise<void> {
  const client = await owner();
  await client.query(`
    truncate table audit_log, notifications, attachments, entry_abm_accounts, search_activities,
                   entry_values, entries, abm_weekly_touches, abm_accounts, task_updates, tasks,
                   calendar_days, user_metric_settings, profiles restart identity cascade`);
  await client.query('delete from auth.users');
  await client.query(`
    update app_settings set value = default_value from (values
      ('daily_due_time', '"19:00"'::jsonb),
      ('backfill_working_days', '2'::jsonb),
      ('weekly_open_time', '"16:00"'::jsonb),
      ('weekly_due_time', '"12:00"'::jsonb),
      ('spike_multiplier', '3'::jsonb),
      ('spike_min_avg', '5'::jsonb),
      ('report_recipients', '[]'::jsonb)
    ) as defaults(k, default_value) where app_settings.key = defaults.k`);
  await client.query(`update reminder_rules set active = true, email = true, in_app = true`);
}

export interface MakeUserOptions {
  fullName?: string;
  role?: 'admin' | 'contributor' | 'viewer';
  timezone?: string;
  /** Default {1,2,3,4,5,6,7}: every day is a working day, so tests do not depend on the weekday. */
  workDays?: number[];
  startDate?: string;
  active?: boolean;
  password?: string | null;
}

export async function makeUser(
  email: string,
  options: MakeUserOptions = {},
): Promise<TestUser> {
  const client = await owner();
  const role = options.role ?? 'contributor';
  const fullName = options.fullName ?? email.split('@')[0]!;
  const timezone = options.timezone ?? 'Asia/Kolkata';
  const hash =
    options.password === null
      ? null
      : await argon2.hash(options.password ?? TEST_PASSWORD, { type: argon2.argon2id });

  const row = await client.query<{ id: string }>(
    'insert into auth.users (email, password_hash) values ($1, $2) returning id',
    [email, hash],
  );
  const id = row.rows[0]!.id;

  await client.query(
    `insert into profiles (id, email, full_name, role, timezone, work_days, start_date, active)
     values ($1, $2, $3, $4, $5, $6::smallint[], coalesce($7::date, current_date - 180), $8)`,
    [
      id,
      email,
      fullName,
      role,
      timezone,
      options.workDays ?? [1, 2, 3, 4, 5, 6, 7],
      options.startDate ?? null,
      options.active ?? true,
    ],
  );

  return { id, email, fullName, role, timezone };
}

/** A client bound to one app, holding a session cookie. */
export class Agent {
  constructor(
    private readonly app: FastifyInstance,
    public cookie: string | undefined,
    public user: TestUser | undefined,
  ) {}

  async request(options: InjectOptions & { url: string }): Promise<ReturnType<FastifyInstance['inject']>> {
    const headers: Record<string, string> = {
      'x-requested-with': 'gtm',
      ...(options.headers as Record<string, string> | undefined),
    };
    if (this.cookie) headers.cookie = this.cookie;
    return this.app.inject({ ...options, headers });
  }

  get(url: string) {
    return this.request({ method: 'GET', url });
  }

  post(url: string, payload?: unknown) {
    return this.request({ method: 'POST', url, payload: payload as object });
  }

  put(url: string, payload?: unknown) {
    return this.request({ method: 'PUT', url, payload: payload as object });
  }

  patch(url: string, payload?: unknown) {
    return this.request({ method: 'PATCH', url, payload: payload as object });
  }

  delete(url: string) {
    return this.request({ method: 'DELETE', url });
  }
}

export async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Sign in and return an agent carrying the session cookie. */
export async function signIn(
  app: FastifyInstance,
  user: TestUser,
  password = TEST_PASSWORD,
): Promise<Agent> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-requested-with': 'gtm' },
    payload: { email: user.email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Sign in failed for ${user.email}: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0]! : String(setCookie);
  const token = raw.split(';')[0]!;
  if (!token.startsWith(`${SESSION_COOKIE}=`)) throw new Error('No session cookie was set');
  return new Agent(app, token, user);
}

export function anonymous(app: FastifyInstance): Agent {
  return new Agent(app, undefined, undefined);
}

/** Run a query as a person, exactly as a route would. */
export async function asUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withUser(userId, fn);
}

/** Today in a person's time zone, as the database sees it. */
export async function localToday(userId: string): Promise<string> {
  const client = await owner();
  const row = await client.query<{ d: string }>('select local_today($1)::text as d', [userId]);
  return row.rows[0]!.d;
}

export async function weekMondayOf(day: string): Promise<string> {
  const client = await owner();
  const row = await client.query<{ d: string }>('select week_monday($1::date)::text as d', [day]);
  return row.rows[0]!.d;
}

/** Create a daily entry already in a finished state, bypassing the rules on purpose. */
export async function seedSubmittedDay(
  userId: string,
  day: string,
  values: Record<string, number> = {},
  status: 'submitted' | 'late' = 'submitted',
): Promise<string> {
  const client = await owner();
  const entry = await client.query<{ id: string }>(
    `insert into entries (user_id, log_type, period_start) values ($1, 'daily', $2) returning id`,
    [userId, day],
  );
  const id = entry.rows[0]!.id;

  await client.query(
    `insert into entry_values (entry_id, metric_key, num_value)
     select $1, key, 0 from metric_definitions where log_type = 'daily' and active`,
    [id],
  );
  for (const [key, value] of Object.entries(values)) {
    await client.query(
      'update entry_values set num_value = $3 where entry_id = $1 and metric_key = $2',
      [id, key, value],
    );
  }
  await client.query(
    `update entries set status = $2, is_late = $3, submitted_at = now() where id = $1`,
    [id, status, status === 'late'],
  );
  return id;
}

/** Fill every enabled daily field with 0, so only the rule under test can fail. */
export async function fillDaily(agent: Agent, entryId: string, fields: { key: string }[]): Promise<void> {
  for (const field of fields) {
    await agent.put(`/api/entries/${entryId}/values/${field.key}`, { numValue: 0 });
  }
}

export function uniqueEmail(prefix = 'person'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Attach a file to an entry field through the real upload route. */
export async function uploadProof(
  agent: Agent,
  entryId: string,
  metricKey: string,
): Promise<number> {
  const boundary = '----gtmtest';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metricKey"\r\n\r\n${metricKey}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.png"\r\n` +
        `Content-Type: image/png\r\n\r\n`,
    ),
    PNG_1X1,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await agent.request({
    method: 'POST',
    url: `/api/entries/${entryId}/attachments`,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  return response.statusCode;
}
