/**
 * The reminder job (NTF-01 to NTF-03). Runs every 15 minutes and once at start.
 *
 *   queue_due_reminders()  works out what is due and records each one exactly once
 *   pending_emails()       lists what still needs sending
 *   mark_email(id, status) records sent, failed or skipped
 *
 * All three are callable only by gtm_app with no user set, so this module uses asApp().
 * The job never throws: a failure is logged and the next run tries again.
 */

import { asApp, many } from '../db.js';
import { notificationEmail } from '../mail/templates.js';
import { sendMail } from '../mail/transport.js';

export interface ReminderRun {
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
}

interface PendingRow {
  id: string;
  email: string;
  full_name: string;
  rule_key: string;
  title: string;
  body: string;
  link: string | null;
  email_on: boolean;
}

export async function runReminders(
  log: { info: (o: unknown, m: string) => void; error: (o: unknown, m: string) => void } = console as never,
  at?: Date,
): Promise<ReminderRun> {
  const run: ReminderRun = { queued: 0, sent: 0, skipped: 0, failed: 0 };

  let pending: PendingRow[] = [];
  try {
    pending = await asApp(async (client) => {
      const queued = await many<{ id: string }>(
        client,
        at ? 'select id from queue_due_reminders($1)' : 'select id from queue_due_reminders()',
        at ? [at.toISOString()] : [],
      );
      run.queued = queued.length;
      return many<PendingRow>(client, 'select * from pending_emails()');
    });
  } catch (error) {
    log.error({ err: (error as Error).message }, 'reminder queue failed');
    return run;
  }

  for (const row of pending) {
    if (!row.email_on) {
      await mark(row.id, 'skipped', log);
      run.skipped += 1;
      continue;
    }
    try {
      await sendMail(
        notificationEmail({
          to: row.email,
          fullName: row.full_name,
          title: row.title,
          body: row.body,
          link: row.link,
        }),
      );
      await mark(row.id, 'sent', log);
      run.sent += 1;
    } catch (error) {
      log.error({ err: (error as Error).message, rule: row.rule_key }, 'reminder email failed');
      await mark(row.id, 'failed', log);
      run.failed += 1;
    }
  }

  log.info(run, 'reminders run');
  return run;
}

async function mark(
  id: string,
  status: 'sent' | 'failed' | 'skipped',
  log: { error: (o: unknown, m: string) => void },
): Promise<void> {
  try {
    await asApp(async (client) => {
      await client.query('select mark_email($1, $2)', [id, status]);
    });
  } catch (error) {
    log.error({ err: (error as Error).message, id }, 'could not mark an email');
  }
}
