/**
 * The reminder job and the Monday report, checked against the real Mailpit inbox
 * (BUILD.md phase 4, item 5): one email per pending notification, and none on a second run.
 *
 * Mailpit has to be running (`brew services start mailpit`, or `docker compose up -d`).
 * Without it the suite says so and stops, rather than passing quietly.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asApp } from '../db.js';
import {
  closeOwner,
  localToday,
  makeUser,
  owner,
  resetDatabase,
  uniqueEmail,
  type TestUser,
} from '../test/helpers.js';
import { runReminders } from './reminders.js';
import { runWeeklyReport } from './weekly-report.js';

const MAILPIT = 'http://localhost:8025';

const quiet = {
  info: () => undefined,
  error: () => undefined,
};

interface MailpitMessage {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=1`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
}

async function inbox(): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT}/api/v1/messages?limit=200`);
  const body = (await response.json()) as { messages: MailpitMessage[] };
  return body.messages ?? [];
}

async function message(id: string): Promise<{ text: string; html: string }> {
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const body = (await response.json()) as { Text: string; HTML: string };
  return { text: body.Text ?? '', html: body.HTML ?? '' };
}

async function messageText(id: string): Promise<string> {
  const both = await message(id);
  return `${both.text}\n${both.html}`;
}

let available = false;
let admin: TestUser;
let tanzil: TestUser;

beforeAll(async () => {
  available = await mailpitAvailable();
  if (!available) {
    throw new Error(
      `Mailpit is not answering on ${MAILPIT}. Start it with "brew services start mailpit" (or "docker compose up -d") and run the suite again.`,
    );
  }
});

afterAll(async () => {
  await closeOwner();
});

beforeEach(async () => {
  await resetDatabase();
  await clearInbox();
  admin = await makeUser(uniqueEmail('admin'), { role: 'admin', fullName: 'Raphy' });
  tanzil = await makeUser(uniqueEmail('tanzil'), { fullName: 'Tanzil' });
});

/** An instant that is the given local hour in the person's time zone, on their today. */
async function atLocalHour(userId: string, hour: number): Promise<Date> {
  const client = await owner();
  const row = await client.query<{ at: Date }>(
    `select (local_today($1) + make_time($2, 5, 0)) at time zone (select timezone from profiles where id = $1) as at`,
    [userId, hour],
  );
  return row.rows[0]!.at;
}

describe('NTF-01 · reminders become emails', () => {
  it('sends one email for each pending notification, and none on a second run', async () => {
    // A task overdue by a day gives the job something certain to find.
    const today = await localToday(tanzil.id);
    const client = await owner();
    await client.query(
      `insert into tasks (title, assignee_id, due_date, created_by) values ($1, $2, $3::date - 1, $4)`,
      ['Clean the list', tanzil.id, today, admin.id],
    );

    const first = await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    expect(first.queued).toBeGreaterThan(0);
    expect(first.sent).toBe(first.queued);
    expect(first.failed).toBe(0);

    const afterFirst = await inbox();
    expect(afterFirst).toHaveLength(first.sent);
    expect(afterFirst.some((m) => m.To.some((t) => t.Address === tanzil.email))).toBe(true);

    const second = await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    expect(second.sent).toBe(0);
    expect(await inbox()).toHaveLength(first.sent);
  });

  it('marks each notification sent, so nothing is queued twice', async () => {
    const today = await localToday(tanzil.id);
    const client = await owner();
    await client.query(
      `insert into tasks (title, assignee_id, due_date, created_by) values ($1, $2, $3::date, $4)`,
      ['Due today', tanzil.id, today, admin.id],
    );

    await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    const statuses = await client.query<{ email_status: string }>(
      'select email_status from notifications',
    );
    expect(statuses.rows.length).toBeGreaterThan(0);
    for (const row of statuses.rows) expect(row.email_status).toBe('sent');
  });

  it('skips a rule whose email is switched off, and still marks it', async () => {
    const client = await owner();
    const today = await localToday(tanzil.id);
    await client.query(`update reminder_rules set email = false where key = 'task_due_today'`);
    await client.query(
      `insert into tasks (title, assignee_id, due_date, created_by) values ($1, $2, $3::date, $4)`,
      ['Due today', tanzil.id, today, admin.id],
    );

    const run = await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    expect(run.skipped).toBeGreaterThan(0);

    const statuses = await client.query<{ email_status: string }>(
      `select email_status from notifications where rule_key = 'task_due_today'`,
    );
    expect(statuses.rows[0]!.email_status).toBe('skipped');

    // Nothing for that rule reached the inbox.
    const subjects = (await inbox()).map((m) => m.Subject);
    expect(subjects).not.toContain('Task due today');
  });

  it('creates no reminder outside the three-hour window after a rule’s time', async () => {
    const today = await localToday(tanzil.id);
    const client = await owner();
    await client.query(
      `insert into tasks (title, assignee_id, due_date, created_by) values ($1, $2, $3::date, $4)`,
      ['Due today', tanzil.id, today, admin.id],
    );
    // Creating a task tells the assignee straight away; that is not a timed reminder, so it is
    // cleared out before checking that no *rule* fires.
    await client.query(`delete from notifications where rule_key = 'task_assigned'`);

    // Every rule that could apply here fires at 10:00, so 06:00 is before all of them.
    await runReminders(quiet, await atLocalHour(tanzil.id, 6));

    const rows = await client.query<{ rule_key: string }>('select rule_key from notifications');
    expect(rows.rows).toEqual([]);
    expect(await inbox()).toHaveLength(0);
  });

  it('emails the unlock notice an admin creates', async () => {
    const client = await owner();
    const today = await localToday(tanzil.id);
    await client.query(
      `select set_config('app.user_id', $1, false)`,
      [admin.id],
    );
    await client.query('select unlock_entry($1, $2, $3, $4)', [
      tanzil.id,
      'daily',
      today,
      'The email count looked wrong.',
    ]);
    await client.query(`select set_config('app.user_id', '', false)`);

    const run = await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    expect(run.sent).toBeGreaterThan(0);

    const messages = await inbox();
    const unlock = messages.find((m) => m.Subject.includes('was unlocked'));
    expect(unlock).toBeDefined();

    const text = await messageText(unlock!.ID);
    expect(text).toContain('The email count looked wrong.');
    expect(text).toContain('Yallo GTM tracker');
  });

  it('only the job runner may call the queue functions', async () => {
    // asApp() is gtm_app with no user, which is how the job runs: it is allowed.
    const rows = await asApp(async (client) => {
      const result = await client.query('select * from pending_emails()');
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });
});

describe('RPT-02 · the Monday report email', () => {
  it('skips when nobody is listed as a recipient', async () => {
    const run = await runWeeklyReport(quiet);
    expect(run.sent).toBe(0);
    expect(run.reason).toBe('no recipients');
    expect(await inbox()).toHaveLength(0);
  });

  it('emails every recipient last week’s summary', async () => {
    const client = await owner();
    await client.query(
      `update app_settings set value = $1::jsonb where key = 'report_recipients'`,
      [JSON.stringify([admin.email])],
    );

    const run = await runWeeklyReport(quiet);
    expect(run.sent).toBe(1);

    const messages = await inbox();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.Subject).toMatch(/^GTM report, week of /);
    expect(messages[0]!.To[0]!.Address).toBe(admin.email);

    const text = await messageText(messages[0]!.ID);
    expect(text).toContain('Compliance:');
    expect(text).toContain('Backlog:');
  });
});

describe('email content', () => {
  it('escapes anything a person typed', async () => {
    const client = await owner();
    const today = await localToday(tanzil.id);
    await client.query(
      `insert into tasks (title, assignee_id, due_date, created_by) values ($1, $2, $3::date, $4)`,
      ['<script>alert(1)</script> & co', tanzil.id, today, admin.id],
    );

    await runReminders(quiet, await atLocalHour(tanzil.id, 10));
    const messages = await inbox();
    const task = messages.find((m) => m.Subject === 'Task due today');
    expect(task).toBeDefined();

    const { html, text } = await message(task!.ID);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&amp; co');
    // The plain-text alternative is not markup, so it carries the title as typed.
    expect(text).toContain('<script>alert(1)</script> & co');
  });
});
