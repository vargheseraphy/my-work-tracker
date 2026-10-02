/**
 * The Monday report email (RPT-02). Runs at 09:00 India time and sends last week's summary to
 * the addresses in app_settings.report_recipients. With no recipients it logs and stops.
 */

import { addDays, formatNumber, weekMonday } from '@gtm/shared';
import { asApp, one, withUser } from '../db.js';
import { buildReport } from '../report/service.js';
import { weeklyReportEmail } from '../mail/templates.js';
import { sendMail } from '../mail/transport.js';

export interface ReportRun {
  sent: number;
  monday: string | null;
  reason?: string;
}

export async function runWeeklyReport(
  log: { info: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void } = console as never,
  today = new Date(),
): Promise<ReportRun> {
  // The report job has no user context of its own, so it runs as the first active admin.
  const adminId = await asApp(async (client) => {
    const row = await one<{ id: string | null }>(client, 'select first_admin_id() as id');
    return row?.id ?? null;
  }).catch(() => null);

  if (!adminId) {
    log.info({}, 'weekly report skipped: no active admin');
    return { sent: 0, monday: null, reason: 'no admin' };
  }

  const monday = addDays(weekMonday(today.toISOString().slice(0, 10)), -7);

  try {
    const { report, recipients } = await withUser(adminId, async (client) => {
      const settings = await one<{ value: unknown }>(
        client,
        `select value from app_settings where key = 'report_recipients'`,
      );
      const list = Array.isArray(settings?.value) ? (settings.value as string[]) : [];
      return { report: list.length > 0 ? await buildReport(client, monday) : null, recipients: list };
    });

    if (recipients.length === 0 || !report) {
      log.info({ monday }, 'weekly report skipped: no recipients');
      return { sent: 0, monday, reason: 'no recipients' };
    }

    const lines = [
      `Compliance: ${report.compliance.submitted + report.compliance.late} of ${report.compliance.expected} days signed off, ${report.compliance.late} late, ${report.compliance.missing} missing.`,
      `Outreach: ${formatNumber(report.totals.emails)} emails, ${formatNumber(report.totals.replies)} replies, ${formatNumber(report.totals.accountsAdded)} new accounts.`,
      `Pipeline: ${formatNumber(report.totals.calls)} calls, ${formatNumber(report.totals.meetings)} meetings booked.`,
      `Social: ${formatNumber(report.totals.posts)} posts, ${formatNumber(report.totals.impressions)} impressions.`,
      `Backlog: ${report.tasks.open} open tasks, ${report.tasks.overdue} overdue.`,
    ];

    let sent = 0;
    for (const to of recipients) {
      try {
        await sendMail(weeklyReportEmail({ to, monday, range: report.range, lines }));
        sent += 1;
      } catch (error) {
        log.error({ err: (error as Error).message, to }, 'report email failed');
      }
    }

    log.info({ monday, sent }, 'weekly report sent');
    return { sent, monday };
  } catch (error) {
    log.error({ err: (error as Error).message }, 'weekly report failed');
    return { sent: 0, monday, reason: 'failed' };
  }
}
