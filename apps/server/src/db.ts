/**
 * Database access. Exactly as docs/TECH_SPEC.md section 3 requires.
 *
 * Every web request runs inside one transaction that sets `app.user_id` and switches to the
 * `authenticated` role, so row-level security decides what the request can see and change.
 * Nothing in the server re-implements a rule that lives in a database function.
 */

import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;

// numeric (OID 1700) arrives as a string by default so that very large values keep their precision.
// Every numeric column here is a count or a percentage, so a JavaScript number is safe and far
// easier to work with.
types.setTypeParser(1700, (value: string) => Number.parseFloat(value));
// date (OID 1082): keep the plain YYYY-MM-DD string. Turning it into a Date would apply the
// server's time zone and could shift the day.
types.setTypeParser(1082, (value: string) => value);

export type PoolClient = pg.PoolClient;
export type QueryResultRow = pg.QueryResultRow;

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config().databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'gtm-tracker',
    });
    // A pool error must never take the process down.
    pool.on('error', () => undefined);
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}

/**
 * Run `fn` as the signed-in person. Row-level security applies to everything inside.
 * This is the only way routes should reach the database.
 */
export async function withUser<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    await client.query('set local role authenticated');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // The connection is already broken; the pool will discard it.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run `fn` as the login role `gtm_app`, with no user set and no role switch.
 * Only `auth/**` (credentials and sessions) and `jobs/**` (the reminder queue) may use this;
 * an ESLint rule enforces that.
 */
export async function asApp<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Already gone.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** First row, or undefined. */
export async function one<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<T | undefined> {
  const result = await client.query<T>(text, values);
  return result.rows[0];
}

/** Every row. */
export async function many<T extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await client.query<T>(text, values);
  return result.rows;
}
