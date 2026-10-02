/**
 * Reseed the development database before the browser journeys, so every run starts from the
 * same invented data. Local only: db:reset refuses anything but a localhost database.
 */

import { execFileSync } from 'node:child_process';

export default function globalSetup(): void {
  if (process.env.GTM_SKIP_SEED === 'true') return;
  execFileSync('npx', ['tsx', 'scripts/db-reset.ts'], { stdio: 'inherit' });
}
