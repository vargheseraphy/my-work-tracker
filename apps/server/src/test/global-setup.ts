/**
 * Runs once before the server suite: make sure gtm_test exists and is migrated.
 * Tests never touch the development database.
 */

import { resolve } from 'node:path';
import { loadDotEnv } from '../config.js';
import { adoptExisting, migrate } from '../../../../scripts/migrate.js';

export default async function setup(): Promise<void> {
  // The repository root, four levels up from apps/server/src/test.
  process.chdir(resolve(import.meta.dirname, '../../../..'));
  loadDotEnv();

  const url = process.env.DATABASE_URL_OWNER_TEST;
  if (!url) throw new Error('DATABASE_URL_OWNER_TEST is not set in .env');

  await adoptExisting(url);
  await migrate(url, () => undefined);
}
