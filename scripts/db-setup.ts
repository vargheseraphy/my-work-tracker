/**
 * One-off local setup, run as the owner role:
 *   a) create `gtm`, `gtm_test` and `gtm_verify` if they are missing
 *   b) run every migration on each
 *   c) give the `gtm_app` role its login password from .env
 *
 *   npm run db:setup
 */

import pg from 'pg';
import { loadDotEnv } from '../apps/server/src/config.js';
import { adoptExisting, migrate } from './migrate.js';

export function databaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}

function adminUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = '/postgres';
  return parsed.toString();
}

async function ensureDatabase(ownerUrl: string, name: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: adminUrl(ownerUrl) });
  await client.connect();
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [name]);
    if ((exists.rowCount ?? 0) > 0) return false;
    // A database name cannot be a parameter, so it is quoted instead.
    await client.query(`create database "${name.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await client.end();
  }
}

async function setAppPassword(ownerUrl: string, password: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query(`alter role gtm_app login password '${password.replace(/'/g, "''")}'`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const owner = process.env.DATABASE_URL_OWNER;
  const ownerTest = process.env.DATABASE_URL_OWNER_TEST;
  const password = process.env.GTM_APP_PASSWORD;
  if (!owner || !ownerTest) throw new Error('DATABASE_URL_OWNER and DATABASE_URL_OWNER_TEST must be set in .env');
  if (!password || password === 'change-me') {
    throw new Error('Set GTM_APP_PASSWORD in .env to a generated value');
  }

  const verifyUrl = (() => {
    const parsed = new URL(owner);
    parsed.pathname = '/gtm_verify';
    return parsed.toString();
  })();

  for (const url of [owner, ownerTest, verifyUrl]) {
    const name = databaseName(url);
    const created = await ensureDatabase(owner, name);
    console.log(`${created ? 'Created' : 'Found'} ${name}`);
    await adoptExisting(url);
    await migrate(url);
  }

  await setAppPassword(owner, password);
  console.log('Set the gtm_app login password from .env');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
