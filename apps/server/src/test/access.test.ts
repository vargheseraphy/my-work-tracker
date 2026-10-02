/**
 * Access control, from docs/TESTING.md "Access rules to test" and docs/SECURITY.md
 * "Who can do what". These prove the database refuses, not just that the server does not ask.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withUser } from '../db.js';
import {
  Agent,
  closeOwner,
  localToday,
  makeUser,
  owner,
  resetDatabase,
  seedSubmittedDay,
  signIn,
  startApp,
  uniqueEmail,
  type TestUser,
} from './helpers.js';

let app: FastifyInstance;
let admin: TestUser;
let tanzil: TestUser;
let anil: TestUser;
let viewer: TestUser;
let inactive: TestUser;
let adminAgent: Agent;
let tanzilAgent: Agent;
let viewerAgent: Agent;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
  await closeOwner();
});

beforeEach(async () => {
  await resetDatabase();
  admin = await makeUser(uniqueEmail('admin'), { role: 'admin', fullName: 'Raphy' });
  tanzil = await makeUser(uniqueEmail('tanzil'), { fullName: 'Tanzil' });
  anil = await makeUser(uniqueEmail('anil'), { fullName: 'Anil' });
  viewer = await makeUser(uniqueEmail('viewer'), { role: 'viewer', fullName: 'Leadership' });
  inactive = await makeUser(uniqueEmail('gone'), { fullName: 'Gone', active: false });

  adminAgent = await signIn(app, admin);
  tanzilAgent = await signIn(app, tanzil);
  viewerAgent = await signIn(app, viewer);
});

describe('a contributor reads only their own data', () => {
  it('sees no other person’s entries', async () => {
    const today = await localToday(anil.id);
    await seedSubmittedDay(anil.id, today, { emails: 40 });

    const rows = await withUser(tanzil.id, async (client) => {
      const result = await client.query('select id from entries where user_id = $1', [anil.id]);
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });

  it('cannot read another person’s entry through the API', async () => {
    const today = await localToday(anil.id);
    const entryId = await seedSubmittedDay(anil.id, today);
    expect((await tanzilAgent.get(`/api/entries/${entryId}`)).statusCode).toBe(404);
  });

  it('cannot read another person’s entry values or attachments', async () => {
    const today = await localToday(anil.id);
    const entryId = await seedSubmittedDay(anil.id, today, { emails: 12 });

    const counts = await withUser(tanzil.id, async (client) => {
      const values = await client.query('select 1 from entry_values where entry_id = $1', [entryId]);
      const files = await client.query('select 1 from attachments where entry_id = $1', [entryId]);
      return { values: values.rowCount, files: files.rowCount };
    });
    expect(counts.values).toBe(0);
    expect(counts.files).toBe(0);
  });

  it('cannot read another person’s tasks or notifications', async () => {
    const created = await adminAgent.post('/api/tasks', {
      title: 'Not yours',
      assigneeId: anil.id,
      dueDate: await localToday(anil.id),
    });
    const taskId = created.json().task.id as string;

    expect((await tanzilAgent.get(`/api/tasks/${taskId}`)).statusCode).toBe(404);
    const list = await tanzilAgent.get('/api/tasks');
    expect(list.json().tasks).toHaveLength(0);

    const notifications = await tanzilAgent.get('/api/notifications');
    expect(notifications.json().items).toHaveLength(0);
  });

  it('cannot read the audit log', async () => {
    const rows = await withUser(tanzil.id, async (client) => {
      const result = await client.query('select 1 from audit_log');
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });
});

describe('a contributor reads the shared reference data but writes none of it', () => {
  it('reads profiles, metric definitions, calendar days, reminder rules and settings', async () => {
    const counts = await withUser(tanzil.id, async (client) => ({
      profiles: (await client.query('select 1 from profiles')).rowCount,
      metrics: (await client.query('select 1 from metric_definitions')).rowCount,
      rules: (await client.query('select 1 from reminder_rules')).rowCount,
      settings: (await client.query('select 1 from app_settings')).rowCount,
    }));
    expect(counts.profiles).toBeGreaterThan(0);
    expect(counts.metrics).toBe(32);
    expect(counts.rules).toBe(12);
    expect(counts.settings).toBeGreaterThan(0);
  });

  it('cannot change a metric definition, a reminder rule or an app setting', async () => {
    // These policies filter rather than refuse: the update matches no row, so nothing changes.
    const changed = await withUser(tanzil.id, async (client) => ({
      metrics: (
        await client.query(`update metric_definitions set label = 'Hacked' where key = 'posts'`)
      ).rowCount,
      settings: (
        await client.query(`update app_settings set value = '"00:00"' where key = 'daily_due_time'`)
      ).rowCount,
      rules: (
        await client.query(`update reminder_rules set active = false where key = 'daily_deadline'`)
      ).rowCount,
    }));
    expect(changed).toEqual({ metrics: 0, settings: 0, rules: 0 });

    // And the rows really are untouched.
    const client = await owner();
    const after = await client.query<{ label: string; value: string; active: boolean }>(
      `select (select label from metric_definitions where key = 'posts') as label,
              (select value #>> '{}' from app_settings where key = 'daily_due_time') as value,
              (select active from reminder_rules where key = 'daily_deadline') as active`,
    );
    expect(after.rows[0]).toEqual({ label: 'Posts published', value: '19:00', active: true });
  });

  it('cannot add a holiday or change another person’s profile', async () => {
    const today = await localToday(tanzil.id);
    await expect(
      withUser(tanzil.id, (client) =>
        client.query(
          `insert into calendar_days (day, user_id, kind, label) values ($1, null, 'holiday', 'Free day')`,
          [today],
        ),
      ),
    ).rejects.toThrow();

    const changed = await withUser(tanzil.id, async (client) => {
      const result = await client.query(`update profiles set role = 'admin' where id = $1`, [
        tanzil.id,
      ]);
      return result.rowCount;
    }).catch(() => 0);
    expect(changed).toBe(0);
  });
});

describe('a contributor cannot write what only a function may change', () => {
  it('cannot insert an entry directly', async () => {
    const today = await localToday(tanzil.id);
    await expect(
      withUser(tanzil.id, (client) =>
        client.query(
          `insert into entries (user_id, log_type, period_start) values ($1, 'daily', $2)`,
          [tanzil.id, today],
        ),
      ),
    ).rejects.toThrow();
  });

  it('cannot set status, is_late or submitted_at', async () => {
    const today = await localToday(tanzil.id);
    await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });

    await expect(
      withUser(tanzil.id, (client) =>
        client.query(`update entries set status = 'submitted' where user_id = $1`, [tanzil.id]),
      ),
    ).rejects.toThrow();

    await expect(
      withUser(tanzil.id, (client) =>
        client.query(`update entries set is_late = false where user_id = $1`, [tanzil.id]),
      ),
    ).rejects.toThrow();
  });

  it('cannot create a task', async () => {
    const today = await localToday(tanzil.id);
    const response = await tanzilAgent.post('/api/tasks', {
      title: 'Mine now',
      assigneeId: tanzil.id,
      dueDate: today,
    });
    expect(response.statusCode).toBe(403);
  });

  it('cannot unlock an entry', async () => {
    const today = await localToday(tanzil.id);
    const response = await tanzilAgent.post('/api/admin/unlock', {
      userId: tanzil.id,
      type: 'daily',
      period: today,
      reason: 'Let me in',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('ABM ownership', () => {
  it('lets the owner move the stage but not the name, owner or launch week', async () => {
    const today = await localToday(tanzil.id);
    const monday = (
      await (await owner()).query<{ d: string }>('select week_monday($1::date)::text as d', [today])
    ).rows[0]!.d;

    const created = await adminAgent.post('/api/abm', {
      name: '[Account A]',
      vertical: 'Yallo Talent',
      region: 'UAE',
      ownerId: tanzil.id,
      plannedWeek: monday,
    });
    const id = created.json().account.id as string;

    const stage = await tanzilAgent.patch(`/api/abm/${id}`, { stage: 'Live' });
    expect(stage.statusCode).toBe(200);
    expect(stage.json().account.stage).toBe('Live');
    expect(stage.json().account.liveAt).not.toBeNull();

    const rename = await tanzilAgent.patch(`/api/abm/${id}`, { name: '[Account Z]' });
    expect(rename.statusCode).toBe(409);
    expect(rename.json().message).toBe(
      'Only an admin can change the account, owner or launch week',
    );

    const reassign = await tanzilAgent.patch(`/api/abm/${id}`, { ownerId: anil.id });
    expect(reassign.statusCode).toBe(409);
  });

  it('will not let someone move an account they do not own', async () => {
    const today = await localToday(anil.id);
    const monday = (
      await (await owner()).query<{ d: string }>('select week_monday($1::date)::text as d', [today])
    ).rows[0]!.d;

    const created = await adminAgent.post('/api/abm', {
      name: '[Account B]',
      vertical: 'saasinator AI',
      region: 'KSA',
      ownerId: anil.id,
      plannedWeek: monday,
    });
    const id = created.json().account.id as string;

    const response = await tanzilAgent.patch(`/api/abm/${id}`, { stage: 'Closed' });
    expect(response.statusCode).toBe(404);
  });

  it('lets a contributor add an ABM account to nobody', async () => {
    const today = await localToday(tanzil.id);
    const monday = (
      await (await owner()).query<{ d: string }>('select week_monday($1::date)::text as d', [today])
    ).rows[0]!.d;

    const response = await tanzilAgent.post('/api/abm', {
      name: '[Account C]',
      vertical: 'Yallo Talent',
      region: 'UK',
      ownerId: tanzil.id,
      plannedWeek: monday,
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('a viewer reads what an admin reads, and writes nothing', () => {
  it('reads the dashboard, a person and the report', async () => {
    const today = await localToday(admin.id);
    const month = today.slice(0, 7);
    const monday = (
      await (await owner()).query<{ d: string }>('select week_monday($1::date)::text as d', [today])
    ).rows[0]!.d;

    expect((await viewerAgent.get(`/api/admin/compliance?month=${month}`)).statusCode).toBe(200);
    expect((await viewerAgent.get(`/api/admin/week?monday=${monday}`)).statusCode).toBe(200);
    expect((await viewerAgent.get(`/api/admin/people/${tanzil.id}`)).statusCode).toBe(200);
    expect((await viewerAgent.get(`/api/admin/report?monday=${monday}`)).statusCode).toBe(200);
  });

  it('cannot read the audit log', async () => {
    const rows = await withUser(viewer.id, async (client) => {
      const result = await client.query('select 1 from audit_log');
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });

  it('cannot change anything', async () => {
    const today = await localToday(viewer.id);
    expect(
      (await viewerAgent.post('/api/tasks', {
        title: 'No',
        assigneeId: tanzil.id,
        dueDate: today,
      })).statusCode,
    ).toBe(403);
    expect(
      (await viewerAgent.post('/api/admin/unlock', {
        userId: tanzil.id,
        type: 'daily',
        period: today,
        reason: 'No',
      })).statusCode,
    ).toBe(403);
    expect(
      (await viewerAgent.post('/api/entries/open', { type: 'daily', period: today })).statusCode,
    ).toBe(403);
  });
});

describe('an inactive person', () => {
  it('reads nothing at all', async () => {
    const today = await localToday(anil.id);
    await seedSubmittedDay(anil.id, today);

    const counts = await withUser(inactive.id, async (client) => ({
      profiles: (await client.query('select 1 from profiles')).rowCount,
      entries: (await client.query('select 1 from entries')).rowCount,
      metrics: (await client.query('select 1 from metric_definitions')).rowCount,
    }));
    expect(counts.profiles).toBe(0);
    expect(counts.entries).toBe(0);
    expect(counts.metrics).toBe(0);
  });
});

describe('the web role cannot reach the auth schema or the job functions', () => {
  it('cannot read auth.sessions', async () => {
    await expect(
      withUser(tanzil.id, (client) => client.query('select 1 from auth.sessions')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot read auth.users', async () => {
    await expect(
      withUser(tanzil.id, (client) => client.query('select 1 from auth.users')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('cannot call queue_due_reminders, pending_emails or mark_email', async () => {
    for (const sql of [
      'select queue_due_reminders()',
      'select * from pending_emails()',
      `select mark_email('00000000-0000-0000-0000-000000000000', 'sent')`,
    ]) {
      await expect(withUser(tanzil.id, (client) => client.query(sql))).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it('cannot call create_account or auth_profile', async () => {
    for (const sql of [
      `select create_account('x@example.test', 'X')`,
      `select * from auth_profile('00000000-0000-0000-0000-000000000000')`,
    ]) {
      await expect(withUser(tanzil.id, (client) => client.query(sql))).rejects.toThrow(
        /permission denied/i,
      );
    }
  });
});

describe('catalogue checks', () => {
  it('every table in public has row-level security enabled', async () => {
    const client = await owner();
    const rows = await client.query<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname <> '_migrations'
          and not c.relrowsecurity`,
    );
    expect(rows.rows.map((r) => r.tablename)).toEqual([]);
  });

  it('every table in public has at least one policy', async () => {
    const client = await owner();
    const rows = await client.query<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname <> '_migrations'
          and not exists (select 1 from pg_policy p where p.polrelid = c.oid)`,
    );
    expect(rows.rows.map((r) => r.tablename)).toEqual([]);
  });

  it('every SECURITY DEFINER function in public has a fixed search_path', async () => {
    const client = await owner();
    const rows = await client.query<{ proname: string }>(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and not exists (
            select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(rows.rows.map((r) => r.proname)).toEqual([]);
  });

  it('the application role owns nothing in public', async () => {
    const client = await owner();
    const rows = await client.query<{ relname: string }>(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relowner = 'gtm_app'::regrole`,
    );
    expect(rows.rows).toEqual([]);
  });
});
