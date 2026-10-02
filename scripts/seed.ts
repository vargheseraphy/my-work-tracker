/**
 * Invented local data (docs/TESTING.md "Seed data"). Local only, and every name, address and
 * number here is made up: never put a real person's details in this file.
 *
 *   npm run db:seed
 *
 * Runs as the owner role, so it can write the tables a web request may not.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import argon2 from 'argon2';
import pg from 'pg';
import { addDays, weekMonday } from '@gtm/shared';
import { loadDotEnv } from '../apps/server/src/config.js';
import { assertLocal } from './local-only.js';

/** A real 1 x 1 PNG, so the magic-byte check and the image viewer both behave normally. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface SeedPerson {
  key: string;
  email: string;
  fullName: string;
  role: 'admin' | 'contributor' | 'viewer';
  timezone: string;
  /** Weekly fields this person does not log, to exercise ADM-02. */
  disabled?: string[];
}

const PEOPLE: SeedPerson[] = [
  { key: 'raphy', email: 'raphy@example.test', fullName: 'Raphy', role: 'admin', timezone: 'Asia/Kolkata' },
  { key: 'tanzil', email: 'tanzil@example.test', fullName: 'Tanzil', role: 'contributor', timezone: 'Asia/Kolkata' },
  {
    key: 'anil',
    email: 'anil@example.test',
    fullName: 'Anil',
    role: 'contributor',
    timezone: 'Asia/Dubai',
    disabled: ['wk_ga_report', 'wk_ga_users', 'wk_ga_sessions', 'wk_ga_top_page', 'wk_forms', 'wk_form_companies'],
  },
  {
    key: 'tamre',
    email: 'tamre@example.test',
    fullName: 'Tamre',
    role: 'contributor',
    timezone: 'Asia/Kolkata',
    disabled: ['wk_ga_report', 'wk_ga_users', 'wk_ga_sessions', 'wk_ga_top_page', 'wk_forms', 'wk_form_companies'],
  },
  { key: 'viewer', email: 'viewer@example.test', fullName: 'Leadership', role: 'viewer', timezone: 'Asia/Kolkata' },
];

const WEEKLY_TARGETS: Record<string, number> = {
  posts: 5,
  dms: 50,
  emails: 150,
  accounts_added: 25,
  contacts_added: 120,
  wk_calls: 10,
  wk_meetings: 3,
};

/** Rough daily shapes per person, so the dashboard has something to show. */
const DAILY_SHAPE: Record<string, Record<string, [number, number]>> = {
  tanzil: {
    posts: [0, 1], comments: [6, 14], likes: [20, 45], dms: [8, 16],
    emails: [25, 45], templates: [0, 1], replies: [1, 5],
    accounts_found: [6, 14], accounts_added: [4, 9], contacts_added: [18, 32],
    contacts_filtered: [8, 18], posters: [0, 1], newsletters: [0, 1],
  },
  anil: {
    posts: [0, 1], comments: [4, 10], likes: [15, 35], dms: [5, 12],
    emails: [18, 36], templates: [0, 1], replies: [0, 4],
    accounts_found: [4, 10], accounts_added: [3, 7], contacts_added: [12, 26],
    contacts_filtered: [5, 14], posters: [0, 2], newsletters: [0, 1],
  },
  tamre: {
    posts: [0, 2], comments: [8, 18], likes: [25, 60], dms: [3, 9],
    emails: [10, 24], templates: [0, 2], replies: [0, 3],
    accounts_found: [3, 8], accounts_added: [2, 5], contacts_added: [8, 20],
    contacts_filtered: [4, 12], posters: [1, 3], newsletters: [0, 1],
  },
};

const FILE_PROOF = new Set(['comments', 'dms', 'emails', 'posters']);
const LINK_PROOF: Record<string, string> = {
  posts: 'https://example.test/linkedin/post',
  templates: 'https://example.test/accumba/template',
  newsletters: 'https://example.test/campaign',
};

const ABM_ACCOUNTS = [
  { name: '[Account A]', vertical: 'Yallo Talent', region: 'UAE', stage: 'Closed', weeksAgo: 5, owner: 'tanzil' },
  { name: '[Account B]', vertical: 'saasinator AI', region: 'KSA', stage: 'Meeting booked', weeksAgo: 4, owner: 'anil' },
  { name: '[Account C]', vertical: 'Yallo AI Academy', region: 'India', stage: 'Engaged', weeksAgo: 3, owner: 'tamre' },
  // Week 2 weeks ago has no account on purpose, so the strip shows a missed week (ABM-03).
  { name: '[Account D]', vertical: 'Yallo Talent', region: 'UK', stage: 'Live', weeksAgo: 1, owner: 'tanzil' },
  { name: '[Account E]', vertical: 'saasinator AI', region: 'UAE', stage: 'Assets ready', weeksAgo: 0, owner: 'anil' },
  { name: '[Account F]', vertical: 'Yallo AI Academy', region: 'Other', stage: 'Research', weeksAgo: -1, owner: 'tamre' },
];

function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function password(): string {
  // Readable but random, and well over the 12-character minimum.
  const words = ['amber', 'harbour', 'lantern', 'meadow', 'pebble', 'quartz', 'summit', 'willow'];
  const pick = () => words[Math.floor(Math.random() * words.length)]!;
  return `${pick()}-${pick()}-${randomBytes(2).toString('hex')}`;
}

async function main(): Promise<void> {
  loadDotEnv();
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  if (!ownerUrl) throw new Error('DATABASE_URL_OWNER is not set in .env');
  assertLocal(ownerUrl, 'db:seed');

  const uploadDir = resolve(process.cwd(), process.env.UPLOAD_DIR ?? './data/uploads');
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();

  const logins: { role: string; email: string; password: string }[] = [];

  try {
    await client.query('begin');

    // Start from a clean sheet, but keep the reference data from migration 0004.
    await client.query(`
      truncate table audit_log, notifications, attachments, entry_abm_accounts, search_activities,
                     entry_values, entries, abm_weekly_touches, abm_accounts, task_updates, tasks,
                     calendar_days, user_metric_settings, profiles restart identity cascade`);
    await client.query('delete from auth.users');

    // ---------- people ----------
    const ids: Record<string, string> = {};
    for (const person of PEOPLE) {
      const plain = password();
      const hash = await argon2.hash(plain, { type: argon2.argon2id });
      const row = await client.query<{ id: string }>(
        'insert into auth.users (email, password_hash) values ($1, $2) returning id',
        [person.email, hash],
      );
      const id = row.rows[0]!.id;
      ids[person.key] = id;

      await client.query(
        `insert into profiles (id, email, full_name, role, timezone, start_date)
         values ($1, $2, $3, $4, $5, current_date - 120)`,
        [id, person.email, person.fullName, person.role, person.timezone],
      );

      for (const key of person.disabled ?? []) {
        await client.query(
          `insert into user_metric_settings (user_id, metric_key, enabled) values ($1, $2, false)
           on conflict (user_id, metric_key) do update set enabled = false`,
          [id, key],
        );
      }

      if (person.role === 'contributor') {
        for (const [key, target] of Object.entries(WEEKLY_TARGETS)) {
          await client.query(
            `insert into user_metric_settings (user_id, metric_key, enabled, weekly_target)
             values ($1, $2, true, $3)
             on conflict (user_id, metric_key) do update set weekly_target = excluded.weekly_target`,
            [id, key, target],
          );
        }
      }

      logins.push({ role: person.fullName, email: person.email, password: plain });
    }

    const today = (await client.query<{ d: string }>('select current_date::text as d')).rows[0]!.d;
    const monday = weekMonday(today);

    // ---------- a public holiday and one leave day ----------
    await client.query(
      `insert into calendar_days (day, user_id, kind, label, created_by)
       values ($1, null, 'holiday', 'Public holiday', $2)`,
      [nearestWeekday(addDays(today, -17)), ids.raphy],
    );
    await client.query(
      `insert into calendar_days (day, user_id, kind, label, created_by)
       values ($1, $2, 'leave', 'Annual leave', $3)`,
      [nearestWeekday(addDays(today, -9)), ids.anil, ids.raphy],
    );

    // ---------- four weeks of daily and weekly logs ----------
    const holidays = (
      await client.query<{ day: string; user_id: string | null }>(
        'select day::text as day, user_id from calendar_days',
      )
    ).rows;

    for (const person of PEOPLE.filter((p) => p.role === 'contributor')) {
      const userId = ids[person.key]!;
      const shape = DAILY_SHAPE[person.key]!;
      let lateLeft = person.key === 'anil' ? 2 : 0;

      for (let back = 28; back >= 1; back -= 1) {
        const day = addDays(today, -back);
        const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        if (holidays.some((h) => h.day === day && (h.user_id === null || h.user_id === userId))) {
          continue;
        }

        // Tanzil misses one working day inside the backfill window.
        if (person.key === 'tanzil' && day === previousWorkingDay(today, 1)) continue;

        const late = lateLeft > 0 && back % 9 === 0;
        if (late) lateLeft -= 1;

        const entry = await client.query<{ id: string }>(
          `insert into entries (user_id, log_type, period_start) values ($1, 'daily', $2) returning id`,
          [userId, day],
        );
        const entryId = entry.rows[0]!.id;

        for (const [key, [min, max]] of Object.entries(shape)) {
          let value = between(min, max);
          if (key === 'contacts_filtered') {
            const added = between(shape.contacts_added![0], shape.contacts_added![1]);
            value = Math.min(value, added);
          }
          const text = value > 0 ? (LINK_PROOF[key] ?? null) : null;
          await client.query(
            `insert into entry_values (entry_id, metric_key, num_value, text_value)
             values ($1, $2, $3, $4)`,
            [entryId, key, value, text],
          );
          if (value > 0 && FILE_PROOF.has(key)) {
            await addProof(client, uploadDir, userId, entryId, key);
          }
        }

        // Make sure the cross-field rule holds for every seeded day.
        await client.query(
          `update entry_values set num_value = least(
             num_value,
             (select num_value from entry_values where entry_id = $1 and metric_key = 'contacts_added'))
            where entry_id = $1 and metric_key = 'contacts_filtered'`,
          [entryId],
        );

        await client.query(
          `update entries set status = $2, is_late = $3, submitted_at = $4::date + time '18:30'
            where id = $1`,
          [entryId, late ? 'late' : 'submitted', late, day],
        );
      }

      // Weekly logs for the three completed weeks.
      for (let w = 3; w >= 1; w -= 1) {
        const week = addDays(monday, -7 * w);
        const entry = await client.query<{ id: string }>(
          `insert into entries (user_id, log_type, period_start) values ($1, 'weekly', $2) returning id`,
          [userId, week],
        );
        const entryId = entry.rows[0]!.id;
        const disabled = new Set(person.disabled ?? []);

        const weekly: Record<string, number> = {
          wk_calls: between(6, 14),
          wk_meetings: between(1, 4),
          wk_open_rate: between(28, 52),
          wk_impressions: between(1800, 4200) + (4 - w) * 300,
          wk_followers: 2800 + (4 - w) * between(40, 160),
          wk_forms: between(0, 4),
          wk_ga_users: between(300, 900),
          wk_ga_sessions: between(400, 1200),
        };

        for (const [key, value] of Object.entries(weekly)) {
          if (disabled.has(key)) continue;
          await client.query(
            'insert into entry_values (entry_id, metric_key, num_value) values ($1, $2, $3)',
            [entryId, key, value],
          );
        }
        for (const key of ['wk_open_rate', 'wk_impressions']) {
          await addProof(client, uploadDir, userId, entryId, key);
        }
        if (!disabled.has('wk_ga_report')) {
          await addProof(client, uploadDir, userId, entryId, 'wk_ga_report');
        }

        const texts: Record<string, string> = {
          wk_reflect_worked: 'Short, specific messages got more replies than long ones.',
          wk_reflect_not: 'Posting late in the day. Impressions were about half the usual.',
          wk_reflect_focus: 'Book two meetings from the accounts already replying.',
          wk_ga_top_page: '/pricing',
          wk_form_companies: weekly.wk_forms! > 0 ? '[Company One], [Company Two]' : '',
        };
        for (const [key, value] of Object.entries(texts)) {
          if (disabled.has(key) || value === '') continue;
          await client.query(
            'insert into entry_values (entry_id, metric_key, text_value) values ($1, $2, $3)',
            [entryId, key, value],
          );
        }

        await client.query(
          `insert into search_activities (entry_id, kind, description, link) values
             ($1, 'SEO', 'Rewrote the pricing page title and description', 'https://example.test/pricing'),
             ($1, 'AEO', 'Added a questions and answers block to the services page', null)`,
          [entryId],
        );

        await client.query(
          `update entries set status = 'submitted', submitted_at = $2::date + 7 + time '11:00',
                  auto_totals = (select jsonb_object_agg(metric_key, total) from week_auto_totals($3, $2))
            where id = $1`,
          [entryId, week, userId],
        );
      }
    }

    // ---------- ABM accounts ----------
    const accountIds: Record<string, string> = {};
    for (const account of ABM_ACCOUNTS) {
      const row = await client.query<{ id: string }>(
        `insert into abm_accounts
           (name, vertical, region, owner_id, planned_week, stage, notes, research_url, created_by, live_at)
         values ($1, $2, $3, $4, $5, $6::abm_stage, $7, $8, $9,
                 case when $6::abm_stage in ('Live','Engaged','Meeting booked','Closed') then now() end)
         returning id`,
        [
          account.name,
          account.vertical,
          account.region,
          ids[account.owner],
          addDays(monday, -7 * account.weeksAgo),
          account.stage,
          'Invented account for the local build.',
          'https://example.test/research',
          ids.raphy,
        ],
      );
      accountIds[account.name] = row.rows[0]!.id;

      await client.query(
        `insert into abm_weekly_touches (account_id, week_start, emails, messages, calls, updated_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          row.rows[0]!.id,
          addDays(monday, -7 * Math.max(account.weeksAgo, 0)),
          between(2, 9),
          between(1, 6),
          between(0, 3),
          ids[account.owner],
        ],
      );
    }

    // ---------- the backlog ----------
    const tasks: {
      title: string;
      assignee: string;
      dueOffset: number;
      priority: string;
      status: string;
      note?: string;
      proof?: string;
    }[] = [
      { title: 'Clean the UAE contact list', assignee: 'tanzil', dueOffset: -4, priority: 'High', status: 'Blocked', note: 'Waiting for the export from the CRM.' },
      { title: 'Draft the saasinator one-pager', assignee: 'tamre', dueOffset: 0, priority: 'High', status: 'In progress' },
      { title: 'Rewrite the careers page copy', assignee: 'anil', dueOffset: -9, priority: 'Medium', status: 'Done', note: 'Published on Monday.', proof: 'https://example.test/careers' },
      { title: 'Build the KSA account shortlist', assignee: 'anil', dueOffset: 2, priority: 'Medium', status: 'Not started' },
      { title: 'Set up the newsletter template', assignee: 'tamre', dueOffset: 5, priority: 'Low', status: 'Not started' },
      { title: 'Check the open rate drop in week 2', assignee: 'tanzil', dueOffset: 1, priority: 'High', status: 'In progress' },
      { title: 'Collect three case study quotes', assignee: 'tamre', dueOffset: -2, priority: 'Medium', status: 'In progress' },
      { title: 'Tidy the ABM research folder', assignee: 'anil', dueOffset: 7, priority: 'Low', status: 'Not started' },
    ];

    for (const task of tasks) {
      const row = await client.query<{ id: string }>(
        `insert into tasks (title, description, assignee_id, due_date, priority, status, status_note, proof_url, completed_at, created_by)
         values ($1, $2, $3, $4, $5, $6::task_status, $7, $8,
                 case when $6::task_status = 'Done' then now() end, $9) returning id`,
        [
          task.title,
          'Invented backlog item for the local build.',
          ids[task.assignee],
          addDays(today, task.dueOffset),
          task.priority,
          task.status,
          task.note ?? null,
          task.proof ?? null,
          ids.raphy,
        ],
      );
      if (task.status !== 'Not started') {
        await client.query(
          `insert into task_updates (task_id, user_id, status, note, proof_url, local_date)
           values ($1, $2, $3, $4, $5, current_date - 1)`,
          [row.rows[0]!.id, ids[task.assignee], task.status, task.note ?? null, task.proof ?? null],
        );
      }
    }

    // ---------- who the Monday report goes to ----------
    await client.query(
      `insert into app_settings (key, value) values ('report_recipients', $1::jsonb)
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(['raphy@example.test'])],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }

  console.log('\nSeeded. Local test logins (invented, local only):\n');
  for (const login of logins) {
    console.log(`  ${login.role.padEnd(12)} ${login.email.padEnd(24)} ${login.password}`);
  }
  console.log('\nThese are also written to docs/progress.md under "Local accounts".');
  await writeLogins(logins);

  // The browser journeys need to sign in, so the logins go to a git-ignored file as well.
  const accountsPath = resolve(uploadDir, '..', 'seed-accounts.json');
  await mkdir(dirname(accountsPath), { recursive: true });
  await writeFile(accountsPath, JSON.stringify(logins, null, 2), { mode: 0o600 });
}

async function addProof(
  client: pg.Client,
  uploadDir: string,
  userId: string,
  entryId: string,
  metricKey: string,
): Promise<void> {
  const storagePath = `${userId}/${entryId}/${randomUUID()}.png`;
  const full = resolve(uploadDir, storagePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, PNG_1X1, { mode: 0o600 });
  await client.query(
    `insert into attachments (owner_id, entry_id, metric_key, storage_path, file_name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, 'image/png', $6)`,
    [userId, entryId, metricKey, storagePath, `${metricKey}.png`, PNG_1X1.byteLength],
  );
}

/** Step back to the most recent weekday. */
function nearestWeekday(day: string): string {
  let d = day;
  for (let i = 0; i < 7; i += 1) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return d;
    d = addDays(d, -1);
  }
  return d;
}

/** The nth working day before `from`, ignoring holidays. */
function previousWorkingDay(from: string, n: number): string {
  let left = n;
  let d = from;
  while (left > 0) {
    d = addDays(d, -1);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

async function writeLogins(
  logins: { role: string; email: string; password: string }[],
): Promise<void> {
  const path = resolve(process.cwd(), 'docs/progress.md');
  const { readFile } = await import('node:fs/promises');
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return;
  }

  const table = [
    '| Role | Email | Password |',
    '| --- | --- | --- |',
    ...logins.map((l) => `| ${l.role} | ${l.email} | ${l.password} |`),
  ].join('\n');

  const updated = text.replace(
    /(## Local accounts[\s\S]*?\n\n)(\| Role[\s\S]*?)(\n\n## )/,
    `$1${table}$3`,
  );
  await writeFile(path, updated, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
