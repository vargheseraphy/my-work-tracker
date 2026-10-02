/**
 * The migration runner. Applies every file in db/migrations that is not yet recorded, in name
 * order, each inside one transaction, as the owner role.
 *
 * It lives in the server package so the test harness can migrate gtm_test without reaching
 * outside the package; `scripts/migrate.ts` is the command-line wrapper around it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

export async function migrate(url: string, log = console.log): Promise<string[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const applied: string[] = [];

  try {
    await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )`);

    const done = new Set(
      (await client.query<{ name: string }>('select name from public._migrations')).rows.map(
        (r) => r.name,
      ),
    );

    for (const name of migrationFiles()) {
      if (done.has(name)) continue;
      const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations (name) values ($1)', [name]);
        await client.query('commit');
        applied.push(name);
        log(`  applied ${name}`);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`${name} failed: ${(error as Error).message}`);
      }
    }

    if (applied.length === 0) log('  nothing to apply');
    return applied;
  } finally {
    await client.end();
  }
}

/**
 * The first run meets databases that were migrated by hand in phase 0 and have no _migrations
 * table. Record what is already there rather than trying to apply it twice.
 */
export async function adoptExisting(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const hasTable = await client.query<{ exists: boolean }>(
      `select exists (select 1 from pg_tables where schemaname = 'public' and tablename = '_migrations') as exists`,
    );
    if (hasTable.rows[0]?.exists) return;

    const hasSchema = await client.query<{ exists: boolean }>(
      `select exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') as exists`,
    );
    if (!hasSchema.rows[0]?.exists) return;

    await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )`);
    // Everything up to 0005 was applied before this runner existed.
    for (const name of migrationFiles().filter((n) => n < '0006')) {
      await client.query(
        'insert into public._migrations (name) values ($1) on conflict do nothing',
        [name],
      );
    }
  } finally {
    await client.end();
  }
}
