/**
 * Apply any migration that has not run yet, as the owner role.
 *
 *   npm run db:migrate                     apply to DATABASE_URL_OWNER
 *   npm run db:migrate -- --test           apply to DATABASE_URL_OWNER_TEST
 *   npm run db:migrate -- --all            apply to both
 *   npm run db:migrate -- --url <url>      apply to any database
 *
 * The runner itself lives in apps/server/src/migrations.ts, so the test harness can use it too.
 */

import { loadDotEnv } from '../apps/server/src/config.js';
import { adoptExisting, migrate } from '../apps/server/src/migrations.js';

export { adoptExisting, migrate };

function ownerUrl(argv: string[]): string {
  const urlFlag = argv.indexOf('--url');
  if (urlFlag !== -1 && argv[urlFlag + 1]) return argv[urlFlag + 1]!;
  const key = argv.includes('--test') ? 'DATABASE_URL_OWNER_TEST' : 'DATABASE_URL_OWNER';
  const url = process.env[key];
  if (!url) throw new Error(`${key} is not set in .env`);
  return url;
}

async function main(): Promise<void> {
  loadDotEnv();
  const argv = process.argv.slice(2);
  const targets = argv.includes('--all')
    ? [process.env.DATABASE_URL_OWNER, process.env.DATABASE_URL_OWNER_TEST].filter(
        (url): url is string => Boolean(url),
      )
    : [ownerUrl(argv)];

  for (const url of targets) {
    console.log(`Migrating ${new URL(url).pathname.slice(1)}`);
    await adoptExisting(url);
    await migrate(url);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
