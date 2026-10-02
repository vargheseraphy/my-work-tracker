/**
 * Migration runner. Applies every file in db/migrations that is not yet recorded, in name order,
 * each inside one transaction, as the owner role.
 *
 *   npm run db:migrate                     apply to DATABASE_URL_OWNER
 *   npm run db:migrate -- --test           apply to DATABASE_URL_OWNER_TEST
 *   npm run db:migrate -- --url <url>      apply to any database
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadDotEnv } from '../apps/server/src/config.js';
const MIGRATIONS_DIR = resolve(process.cwd(), 'db/migrations');
export function migrationFiles() {
    return readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith('.sql'))
        .sort();
}
export async function migrate(url, log = console.log) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const applied = [];
    try {
        await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )`);
        const done = new Set((await client.query('select name from public._migrations')).rows.map((r) => r.name));
        for (const name of migrationFiles()) {
            if (done.has(name))
                continue;
            const sql = readFileSync(resolve(MIGRATIONS_DIR, name), 'utf8');
            await client.query('begin');
            try {
                await client.query(sql);
                await client.query('insert into public._migrations (name) values ($1)', [name]);
                await client.query('commit');
                applied.push(name);
                log(`  applied ${name}`);
            }
            catch (error) {
                await client.query('rollback');
                throw new Error(`${name} failed: ${error.message}`);
            }
        }
        if (applied.length === 0)
            log('  nothing to apply');
        return applied;
    }
    finally {
        await client.end();
    }
}
/**
 * The first run meets databases that were migrated by hand in phase 0 and have no _migrations
 * table. Record what is already there rather than trying to apply it twice.
 */
export async function adoptExisting(url) {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        const hasTable = await client.query(`select exists (select 1 from pg_tables where schemaname = 'public' and tablename = '_migrations') as exists`);
        if (hasTable.rows[0]?.exists)
            return;
        const hasSchema = await client.query(`select exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles') as exists`);
        if (!hasSchema.rows[0]?.exists)
            return;
        await client.query(`
      create table if not exists public._migrations (
        name        text primary key,
        applied_at  timestamptz not null default now()
      )`);
        // Everything up to 0005 was applied before this runner existed.
        for (const name of migrationFiles().filter((n) => n < '0006')) {
            await client.query('insert into public._migrations (name) values ($1) on conflict do nothing', [name]);
        }
    }
    finally {
        await client.end();
    }
}
function ownerUrl(argv) {
    const urlFlag = argv.indexOf('--url');
    if (urlFlag !== -1 && argv[urlFlag + 1])
        return argv[urlFlag + 1];
    const key = argv.includes('--test') ? 'DATABASE_URL_OWNER_TEST' : 'DATABASE_URL_OWNER';
    const url = process.env[key];
    if (!url)
        throw new Error(`${key} is not set in .env`);
    return url;
}
async function main() {
    loadDotEnv();
    const argv = process.argv.slice(2);
    const targets = argv.includes('--all')
        ? [process.env.DATABASE_URL_OWNER, process.env.DATABASE_URL_OWNER_TEST].filter(Boolean)
        : [ownerUrl(argv)];
    for (const url of targets) {
        console.log(`Migrating ${new URL(url).pathname.slice(1)}`);
        await adoptExisting(url);
        await migrate(url);
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map