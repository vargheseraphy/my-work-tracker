/**
 * Drop and recreate the local database, migrate it and seed it. Local only.
 *
 *   npm run db:reset              the development database
 *   npm run db:reset -- --test    the test database (migrate only, no seed)
 */

import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadDotEnv } from '../apps/server/src/config.js';
import { assertLocal } from './local-only.js';
import { migrate } from './migrate.js';
import { databaseName } from './db-setup.js';

async function recreate(ownerUrl: string): Promise<void> {
  const name = databaseName(ownerUrl);
  const admin = new URL(ownerUrl);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    // Close anything still connected, or the drop will wait for ever.
    await client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [name],
    );
    await client.query(`drop database if exists ${quoted}`);
    await client.query(`create database ${quoted}`);
  } finally {
    await client.end();
  }
  console.log(`Recreated ${name}`);
}

async function main(): Promise<void> {
  loadDotEnv();
  const test = process.argv.includes('--test');
  const ownerUrl = test ? process.env.DATABASE_URL_OWNER_TEST : process.env.DATABASE_URL_OWNER;
  const appUrl = test ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL;
  if (!ownerUrl || !appUrl) throw new Error('Set the owner and app database URLs in .env');

  assertLocal(ownerUrl, 'db:reset');
  assertLocal(appUrl, 'db:reset');

  await recreate(ownerUrl);
  await migrate(ownerUrl);

  // The gtm_app role is a cluster-level role, so its password survives; the grants do not.
  const password = process.env.GTM_APP_PASSWORD;
  if (password) {
    const client = new pg.Client({ connectionString: ownerUrl });
    await client.connect();
    await client.query(`alter role gtm_app login password '${password.replace(/'/g, "''")}'`);
    await client.end();
  }

  if (!test) {
    // Old proof files point at entries that no longer exist.
    await rm(resolve(process.cwd(), process.env.UPLOAD_DIR ?? './data/uploads'), {
      recursive: true,
      force: true,
    });
    const { execFileSync } = await import('node:child_process');
    execFileSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit' });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
