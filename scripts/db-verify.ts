/**
 * Run the SQL checks in db/verify against a throwaway database and print the result, so the
 * expected results in db/verify/README.md can be compared by eye.
 *
 *   npm run db:verify
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import pg from 'pg';
import { loadDotEnv } from '../apps/server/src/config.js';
import { assertLocal } from './local-only.js';
import { migrate } from './migrate.js';

const PSQL_CANDIDATES = [
  '/opt/homebrew/opt/postgresql@16/bin/psql',
  '/usr/local/opt/postgresql@16/bin/psql',
  '/usr/bin/psql',
  'psql',
];

function findPsql(): string {
  for (const path of PSQL_CANDIDATES) {
    if (path === 'psql' || existsSync(path)) return path;
  }
  return 'psql';
}

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

async function recreate(ownerUrl: string, name: string): Promise<void> {
  const admin = new URL(ownerUrl);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const quoted = `"${name}"`;
    await client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [name],
    );
    await client.query(`drop database if exists ${quoted}`);
    await client.query(`create database ${quoted}`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  const appUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !appUrl) throw new Error('Set DATABASE_URL_OWNER and DATABASE_URL in .env');
  assertLocal(ownerUrl, 'db:verify');

  const name = 'gtm_verify';
  await recreate(ownerUrl, name);
  await migrate(withDatabase(ownerUrl, name), () => undefined);

  const psql = findPsql();
  console.log('Compare what follows with the expected results in db/verify/README.md\n');

  execFileSync(
    psql,
    [withDatabase(ownerUrl, name), '-q', '-f', 'db/verify/01_setup_as_owner.sql'],
    { stdio: 'inherit' },
  );
  execFileSync(psql, [withDatabase(appUrl, name), '-f', 'db/verify/02_checks_as_app.sql'], {
    stdio: 'inherit',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
