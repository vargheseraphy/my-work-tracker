/**
 * Run the reminder job once, now, without waiting for the scheduler.
 *
 *   npm run jobs:run-now
 *   npm run jobs:run-now -- --report       also send the Monday report
 *   npm run jobs:run-now -- --at "2026-10-05T10:05:00+05:30"
 */

import { loadDotEnv } from '../apps/server/src/config.js';
import { closePool } from '../apps/server/src/db.js';
import { runReminders } from '../apps/server/src/jobs/reminders.js';
import { runWeeklyReport } from '../apps/server/src/jobs/weekly-report.js';

const log = {
  info: (o: unknown, m: string) => console.log(m, o),
  error: (o: unknown, m: string) => console.error(m, o),
};

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  loadDotEnv();

  const at = flag('at');
  const result = await runReminders(log, at ? new Date(at) : undefined);
  console.log(
    `\nQueued ${result.queued}, sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}.`,
  );
  console.log('Locally every email is waiting at http://localhost:8025\n');

  if (process.argv.includes('--report')) {
    const report = await runWeeklyReport(log);
    console.log(`Report: sent ${report.sent}${report.reason ? ` (${report.reason})` : ''}.\n`);
  }

  await closePool();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
