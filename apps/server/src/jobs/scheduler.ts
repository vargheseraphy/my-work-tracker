/**
 * node-cron inside the server. Reminders every 15 minutes plus once at start, and the report on
 * Monday at 09:00 in REPORT_TIMEZONE (docs/TECH_SPEC.md section 7).
 *
 * A rule can fire for three hours after its time, so a computer that was asleep still catches up
 * when it wakes; the unique key on notifications stops anything being sent twice.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { runReminders } from './reminders.js';
import { runWeeklyReport } from './weekly-report.js';

let tasks: ScheduledTask[] = [];

export function startScheduler(log: FastifyBaseLogger): void {
  const cfg = config();
  if (!cfg.JOBS_ENABLED) {
    log.info('jobs are switched off (JOBS_ENABLED=false)');
    return;
  }

  const logger = {
    info: (o: unknown, m: string) => log.info(o as object, m),
    error: (o: unknown, m: string) => log.error(o as object, m),
  };

  tasks.push(
    cron.schedule(cfg.REMINDER_CRON, () => {
      void runReminders(logger);
    }),
  );

  tasks.push(
    cron.schedule(
      cfg.REPORT_CRON,
      () => {
        void runWeeklyReport(logger);
      },
      { timezone: cfg.REPORT_TIMEZONE },
    ),
  );

  // Catch up on anything due while the computer was asleep.
  void runReminders(logger);

  log.info(
    { reminders: cfg.REMINDER_CRON, report: `${cfg.REPORT_CRON} ${cfg.REPORT_TIMEZONE}` },
    'scheduler started',
  );
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks = [];
}
