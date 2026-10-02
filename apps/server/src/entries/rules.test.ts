/**
 * Every daily and weekly sign-off rule in docs/BUSINESS_RULES.md, run against the real database
 * through the real routes. One passing and one failing case for each.
 *
 * Test people get work_days {1..7} so nothing depends on the weekday the suite happens to run.
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { EntryScreenDto, SubmitResult } from '@gtm/shared';
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
  uploadProof,
  weekMondayOf,
  type TestUser,
} from '../test/helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await startApp();
});

afterAll(async () => {
  await app.close();
  await closeOwner();
});

beforeEach(async () => {
  await resetDatabase();
});

/** A time zone where the local clock currently reads `hour`, so deadline tests are predictable. */
function tzForLocalHour(hour: number): string {
  const utcHour = new Date().getUTCHours();
  let offset = hour - utcHour;
  while (offset < -11) offset += 24;
  while (offset > 12) offset -= 24;
  // Etc/GMT has the sign the other way round: Etc/GMT+5 is UTC-5.
  return offset <= 0 ? `Etc/GMT+${-offset}` : `Etc/GMT-${offset}`;
}

async function contributor(options: Parameters<typeof makeUser>[1] = {}): Promise<{
  user: TestUser;
  agent: Agent;
}> {
  const user = await makeUser(uniqueEmail('c'), options);
  return { user, agent: await signIn(app, user) };
}

/** A contributor with no missing days behind them, ready to sign today off. */
async function readyContributor(options: Parameters<typeof makeUser>[1] = {}): Promise<{
  user: TestUser;
  agent: Agent;
}> {
  const made = await contributor(options);
  await clearBacklog(made.user);
  return made;
}

async function openToday(agent: Agent, user: TestUser): Promise<EntryScreenDto> {
  const today = await localToday(user.id);
  const response = await agent.post('/api/entries/open', { type: 'daily', period: today });
  expect(response.statusCode).toBe(200);
  return response.json() as EntryScreenDto;
}

/**
 * Sign off every missing working day inside the backfill window, so check 9 ("a missed day
 * blocks today") does not mask the rule a test is actually about.
 */
async function clearBacklog(user: TestUser): Promise<void> {
  const client = await owner();
  const rows = await client.query<{ d: string }>(
    'select d::text as d from missing_days($1) d where within_backfill($1, d)',
    [user.id],
  );
  for (const row of rows.rows) await seedSubmittedDay(user.id, row.d);
}

/** Fill every enabled field with 0, which is a valid answer. */
async function fillZeroes(agent: Agent, screen: EntryScreenDto): Promise<void> {
  for (const field of screen.fields) {
    if (field.valueType === 'text') {
      await agent.put(`/api/entries/${screen.entry.id}/values/${field.key}`, {
        textValue: 'Nothing to report',
      });
    } else if (field.valueType !== 'file' && field.valueType !== 'list') {
      await agent.put(`/api/entries/${screen.entry.id}/values/${field.key}`, { numValue: 0 });
    }
  }
}

async function submit(agent: Agent, entryId: string): Promise<SubmitResult> {
  const response = await agent.post(`/api/entries/${entryId}/submit`);
  expect(response.statusCode).toBe(200);
  return response.json() as SubmitResult;
}

describe('check 1 · the entry must belong to the caller and still be editable', () => {
  it('refuses a second submit of a locked entry', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);

    const first = await submit(agent, screen.entry.id);
    expect(first.ok).toBe(true);

    const second = await submit(agent, screen.entry.id);
    expect(second).toEqual({ ok: false, errors: ['This entry is locked'] });
  });

  it('refuses someone else’s entry', async () => {
    const owner1 = await contributor();
    const other = await contributor();
    const screen = await openToday(owner1.agent, owner1.user);

    const response = await other.agent.post(`/api/entries/${screen.entry.id}/submit`);
    expect(response.statusCode).toBe(403);
  });
});

describe('check 2 and 3 · every enabled field needs a whole number, and 0 is fine', () => {
  it('lists one message per blank field', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // 13 daily fields, plus one "Submit {day} first" per missing day behind them.
    const fieldErrors = result.errors.filter((e) => !e.startsWith('Submit '));
    expect(fieldErrors).toHaveLength(13);
    expect(fieldErrors).toContain('Posts published: enter a number (0 is fine)');
  });

  it('accepts a complete entry of zeroes', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'submitted' });
  });

  it('refuses a fraction', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/likes`, { numValue: 2.5 });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Likes given: enter a whole number, 0 or more');
    }
  });

  it('refuses a negative number at the API before it reaches the database', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    const response = await agent.put(`/api/entries/${screen.entry.id}/values/likes`, {
      numValue: -1,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('check 4 · a file-proof field above 0 needs an attachment', () => {
  it('asks for a screenshot', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/comments`, { numValue: 6 });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Comments made: attach a screenshot');
  });

  it('is satisfied once a screenshot is attached', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/comments`, { numValue: 6 });

    expect(await uploadProof(agent, screen.entry.id, 'comments')).toBe(201);
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'submitted' });
  });
});

describe('check 5 · a link-proof field above 0 needs an https link', () => {
  it('asks for a link', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/posts`, { numValue: 1 });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Posts published: add a link');
  });

  it('refuses a link that is not https', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/posts`, {
      numValue: 1,
      textValue: 'http://example.test/post',
    });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Posts published: add a link');
  });

  it('accepts an https link', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/posts`, {
      numValue: 1,
      textValue: 'https://example.test/post',
    });
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'submitted' });
  });
});

describe('check 6 · filtered contacts cannot be more than contacts added', () => {
  it('refuses more filtered than added', async () => {
    const { user, agent } = await contributor();
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/contacts_added`, { numValue: 10 });
    await agent.put(`/api/entries/${screen.entry.id}/values/contacts_filtered`, { numValue: 20 });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Filtered contacts cannot be more than contacts added');
    }
  });

  it('allows the same number', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/contacts_added`, { numValue: 10 });
    await agent.put(`/api/entries/${screen.entry.id}/values/contacts_filtered`, { numValue: 10 });
    expect((await submit(agent, screen.entry.id)).ok).toBe(true);
  });
});

describe('check 7 · a value far above the four-week average needs a note', () => {
  it('asks for a note', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);
    for (let back = 1; back <= 8; back += 1) {
      await seedSubmittedDay(user.id, addDays(today, -back), { likes: 10 });
    }

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/likes`, { numValue: 100 });

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Likes given is much higher than usual. Add a note.');
    }
  });

  it('is satisfied by a note', async () => {
    const { user, agent } = await contributor({ timezone: tzForLocalHour(10) });
    const today = await localToday(user.id);
    for (let back = 1; back <= 8; back += 1) {
      await seedSubmittedDay(user.id, addDays(today, -back), { likes: 10 });
    }

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/likes`, {
      numValue: 100,
      note: 'Campaign launch day.',
    });
    expect((await submit(agent, screen.entry.id)).ok).toBe(true);
  });

  it('is not applied when the average is under five', async () => {
    const { user, agent } = await contributor({ timezone: tzForLocalHour(10) });
    const today = await localToday(user.id);
    for (let back = 1; back <= 8; back += 1) {
      await seedSubmittedDay(user.id, addDays(today, -back), { likes: 2 });
    }

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await agent.put(`/api/entries/${screen.entry.id}/values/likes`, { numValue: 100 });
    expect((await submit(agent, screen.entry.id)).ok).toBe(true);
  });
});

describe('check 8 · an open task due that day needs a status update', () => {
  it('names the task', async () => {
    const { user, agent } = await contributor();
    const admin = await makeUser(uniqueEmail('a'), { role: 'admin' });
    const adminAgent = await signIn(app, admin);
    const today = await localToday(user.id);

    await adminAgent.post('/api/tasks', {
      title: 'Clean the list',
      assigneeId: user.id,
      dueDate: addDays(today, -1),
      priority: 'High',
    });

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('Task status: Clean the list');
  });

  it('is satisfied once the task has an update', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const admin = await makeUser(uniqueEmail('a'), { role: 'admin' });
    const adminAgent = await signIn(app, admin);
    const today = await localToday(user.id);

    const created = await adminAgent.post('/api/tasks', {
      title: 'Clean the list',
      assigneeId: user.id,
      dueDate: addDays(today, -1),
      priority: 'High',
    });
    const taskId = created.json().task.id as string;

    await agent.post(`/api/tasks/${taskId}/status`, {
      status: 'In progress',
      note: 'Halfway through.',
    });

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    expect((await submit(agent, screen.entry.id)).ok).toBe(true);
  });
});

describe('check 9 · a missed working day blocks today', () => {
  it('names each missing day in the database wording', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);
    // Two working days back, with nothing submitted, so both are inside the window.
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);

    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const order = result.errors.filter((e) => e.startsWith('Submit '));
      expect(order).toHaveLength(2);
      expect(order[0]).toMatch(/^Submit \w{3} \d{2} \w{3} first$/);
      expect(result.errors.join(' ')).toContain(shortDay(addDays(today, -1)));
    }
  });

  it('lets today through once the missed days are filled', async () => {
    const { user, agent } = await contributor({ timezone: tzForLocalHour(10) });
    const today = await localToday(user.id);
    await seedSubmittedDay(user.id, addDays(today, -1));
    await seedSubmittedDay(user.id, addDays(today, -2));

    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    expect((await submit(agent, screen.entry.id)).ok).toBe(true);
  });
});

describe('check 10 · the backfill window is two working days', () => {
  it('refuses to open a day outside it', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);

    const response = await agent.post('/api/entries/open', {
      type: 'daily',
      period: addDays(today, -10),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('Too late to backfill. Ask your admin to unlock.');
  });

  it('allows a day inside it, marked late', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);
    const yesterday = addDays(today, -1);

    const response = await agent.post('/api/entries/open', { type: 'daily', period: yesterday });
    expect(response.statusCode).toBe(200);
    const screen = response.json() as EntryScreenDto;
    await fillZeroes(agent, screen);

    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'late' });
  });

  it('opens a day outside the window once an admin unlocks it', async () => {
    const { user, agent } = await contributor();
    const admin = await makeUser(uniqueEmail('a'), { role: 'admin' });
    const adminAgent = await signIn(app, admin);
    const today = await localToday(user.id);
    const old = addDays(today, -10);

    const unlock = await adminAgent.post('/api/admin/unlock', {
      userId: user.id,
      type: 'daily',
      period: old,
      reason: 'The email count looked wrong.',
    });
    expect(unlock.statusCode).toBe(200);

    const response = await agent.post('/api/entries/open', { type: 'daily', period: old });
    expect(response.statusCode).toBe(200);
    expect((response.json() as EntryScreenDto).entry.status).toBe('unlocked');
  });
});

describe('open_entry refuses days it should refuse', () => {
  it('refuses a future day', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);
    const response = await agent.post('/api/entries/open', {
      type: 'daily',
      period: addDays(today, 1),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('You cannot log a future day');
  });

  it('refuses a non-working day', async () => {
    const user = await makeUser(uniqueEmail('weekday'), { workDays: [1, 2, 3, 4, 5] });
    const agent = await signIn(app, user);
    const today = await localToday(user.id);
    const saturday = nextOfWeekday(today, 6, -1);

    const response = await agent.post('/api/entries/open', { type: 'daily', period: saturday });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('That day is not a working day');
  });

  it('refuses a weekly period that is not a Monday', async () => {
    const { user, agent } = await contributor();
    const today = await localToday(user.id);
    const monday = await weekMondayOf(today);
    const response = await agent.post('/api/entries/open', {
      type: 'weekly',
      period: addDays(monday, 1),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('A weekly log starts on a Monday');
  });
});

describe('lateness', () => {
  it('is submitted before the deadline', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'submitted' });
  });

  it('is late after the deadline', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(21) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'late' });
  });

  it('stays late after an unlock and a second submit', async () => {
    const { user, agent } = await contributor({ timezone: tzForLocalHour(10) });
    const admin = await makeUser(uniqueEmail('a'), { role: 'admin' });
    const adminAgent = await signIn(app, admin);
    const today = await localToday(user.id);
    const yesterday = addDays(today, -1);

    const opened = await agent.post('/api/entries/open', { type: 'daily', period: yesterday });
    const screen = opened.json() as EntryScreenDto;
    await fillZeroes(agent, screen);
    const first = await submit(agent, screen.entry.id);
    expect(first).toEqual({ ok: true, status: 'late' });

    await adminAgent.post('/api/admin/unlock', {
      userId: user.id,
      type: 'daily',
      period: yesterday,
      reason: 'Numbers were wrong.',
    });
    expect(await submit(agent, screen.entry.id)).toEqual({ ok: true, status: 'late' });
  });
});

describe('a locked entry cannot be edited', () => {
  it('refuses a value change after submit', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await submit(agent, screen.entry.id);

    const response = await agent.put(`/api/entries/${screen.entry.id}/values/likes`, {
      numValue: 99,
    });
    expect([403, 409]).toContain(response.statusCode);
  });

  it('refuses a new attachment after submit', async () => {
    const { user, agent } = await readyContributor({ timezone: tzForLocalHour(10) });
    const screen = await openToday(agent, user);
    await fillZeroes(agent, screen);
    await submit(agent, screen.entry.id);
    expect(await uploadProof(agent, screen.entry.id, 'comments')).toBe(404);
  });
});

describe('working days', () => {
  it('never counts a weekend as missing for a Monday-to-Friday person', async () => {
    const user = await makeUser(uniqueEmail('weekday'), { workDays: [1, 2, 3, 4, 5] });
    const client = await owner();
    const today = await localToday(user.id);
    const rows = await client.query<{ d: string }>(
      'select d::text as d from missing_days($1) d',
      [user.id],
    );
    for (const row of rows.rows) {
      const dow = new Date(`${row.d}T00:00:00Z`).getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
      expect(row.d < today).toBe(true);
    }
  });

  it('never counts a holiday as missing', async () => {
    const { user } = await contributor();
    const client = await owner();
    const today = await localToday(user.id);
    const yesterday = addDays(today, -1);

    await client.query(
      `insert into calendar_days (day, user_id, kind, label) values ($1, null, 'holiday', 'Test holiday')`,
      [yesterday],
    );
    const rows = await client.query<{ d: string }>(
      'select d::text as d from missing_days($1) d',
      [user.id],
    );
    expect(rows.rows.map((r) => r.d)).not.toContain(yesterday);
  });

  it('never counts a leave day as missing for that person only', async () => {
    const { user } = await contributor();
    const other = await contributor();
    const client = await owner();
    const today = await localToday(user.id);
    const yesterday = addDays(today, -1);

    await client.query(
      `insert into calendar_days (day, user_id, kind, label) values ($1, $2, 'leave', 'Annual leave')`,
      [yesterday, user.id],
    );

    const mine = await client.query<{ d: string }>('select d::text as d from missing_days($1) d', [
      user.id,
    ]);
    const theirs = await client.query<{ d: string }>(
      'select d::text as d from missing_days($1) d',
      [other.user.id],
    );
    expect(mine.rows.map((r) => r.d)).not.toContain(yesterday);
    expect(theirs.rows.map((r) => r.d)).toContain(yesterday);
  });

  it('never counts a day before the start date as missing', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const user = await makeUser(uniqueEmail('new'), { startDate: addDays(today, -2) });
    const client = await owner();
    const rows = await client.query<{ d: string }>(
      'select d::text as d from missing_days($1) d',
      [user.id],
    );
    for (const row of rows.rows) {
      expect(row.d >= addDays(today, -2)).toBe(true);
    }
  });
});

describe('time zones', () => {
  it('gives two people in different zones a different "today" around midnight', async () => {
    const early = await makeUser(uniqueEmail('early'), { timezone: tzForLocalHour(23) });
    const late = await makeUser(uniqueEmail('late'), { timezone: tzForLocalHour(1) });

    const earlyToday = await localToday(early.id);
    const lateToday = await localToday(late.id);
    expect(earlyToday).not.toBe(lateToday);
    expect(addDays(earlyToday, 1)).toBe(lateToday);
  });
});

describe('weekly sign-off', () => {
  async function weeklyFor(hourTz: string) {
    const user = await makeUser(uniqueEmail('w'), { timezone: hourTz });
    const agent = await signIn(app, user);
    const today = await localToday(user.id);
    const monday = await weekMondayOf(today);
    return { user, agent, today, monday };
  }

  it('refuses before Friday 16:00 local', async () => {
    const { user, agent } = await weeklyFor(tzForLocalHour(10));
    const today = await localToday(user.id);
    const monday = await weekMondayOf(today);
    // A week that has not finished yet: the current week, opened early.
    const client = await owner();
    await client.query(
      `update app_settings set value = '"23:59"' where key = 'weekly_open_time'`,
    );

    const opened = await agent.post('/api/entries/open', { type: 'weekly', period: monday });
    const screen = opened.json() as EntryScreenDto;
    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('The weekly log opens on Friday at 16:00');
    }
  });

  it('refuses while the week still has missing daily logs', async () => {
    const { agent, monday } = await weeklyFor(tzForLocalHour(10));
    const client = await owner();
    await client.query(`update app_settings set value = '"00:00"' where key = 'weekly_open_time'`);

    const opened = await agent.post('/api/entries/open', { type: 'weekly', period: monday });
    const screen = opened.json() as EntryScreenDto;
    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Submit the missing daily logs for this week first');
    }
  });

  it('asks for search activity rows, or "none this week"', async () => {
    const { agent, monday } = await weeklyFor(tzForLocalHour(10));
    const client = await owner();
    await client.query(`update app_settings set value = '"00:00"' where key = 'weekly_open_time'`);

    const opened = await agent.post('/api/entries/open', { type: 'weekly', period: monday });
    const screen = opened.json() as EntryScreenDto;
    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Search activities: add one, or tick none this week');
    }

    await agent.patch(`/api/entries/${screen.entry.id}`, { noSearchActivity: true });
    const after = await submit(agent, screen.entry.id);
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.errors).not.toContain('Search activities: add one, or tick none this week');
    }
  });

  it('asks the owner of a live ABM account to pick one', async () => {
    const { user, agent, monday } = await weeklyFor(tzForLocalHour(10));
    const admin = await makeUser(uniqueEmail('a'), { role: 'admin' });
    const adminAgent = await signIn(app, admin);
    const client = await owner();
    await client.query(`update app_settings set value = '"00:00"' where key = 'weekly_open_time'`);

    const created = await adminAgent.post('/api/abm', {
      name: '[Account A]',
      vertical: 'Yallo Talent',
      region: 'UAE',
      ownerId: user.id,
      plannedWeek: monday,
      stage: 'Live',
    });
    expect(created.statusCode).toBe(201);

    const opened = await agent.post('/api/entries/open', { type: 'weekly', period: monday });
    const screen = opened.json() as EntryScreenDto;
    const result = await submit(agent, screen.entry.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('ABM: pick at least one account');

    await agent.put(`/api/entries/${screen.entry.id}/abm-accounts`, {
      accountIds: [created.json().account.id],
    });
    const after = await submit(agent, screen.entry.id);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.errors).not.toContain('ABM: pick at least one account');
  });

  it('only asks for company names when there was at least one form response', async () => {
    const { agent, monday } = await weeklyFor(tzForLocalHour(10));
    const client = await owner();
    await client.query(`update app_settings set value = '"00:00"' where key = 'weekly_open_time'`);

    const opened = await agent.post('/api/entries/open', { type: 'weekly', period: monday });
    const screen = opened.json() as EntryScreenDto;

    await agent.put(`/api/entries/${screen.entry.id}/values/wk_forms`, { numValue: 0 });
    const none = await submit(agent, screen.entry.id);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors).not.toContain('Which companies?: required');

    await agent.put(`/api/entries/${screen.entry.id}/values/wk_forms`, { numValue: 3 });
    const some = await submit(agent, screen.entry.id);
    expect(some.ok).toBe(false);
    if (!some.ok) expect(some.errors).toContain('Which companies?: required');
  });

  it('auto totals come only from submitted and late daily entries', async () => {
    const { user, agent, today, monday } = await weeklyFor(tzForLocalHour(10));

    await seedSubmittedDay(user.id, monday, { emails: 10 });
    await seedSubmittedDay(user.id, addDays(monday, 1), { emails: 5 }, 'late');
    // A draft day must not count.
    const client = await owner();
    const draft = await client.query<{ id: string }>(
      `insert into entries (user_id, log_type, period_start) values ($1, 'daily', $2) returning id`,
      [user.id, addDays(monday, 2)],
    );
    await client.query(
      `insert into entry_values (entry_id, metric_key, num_value) values ($1, 'emails', 100)`,
      [draft.rows[0]!.id],
    );

    expect(today >= monday).toBe(true);
    const response = await agent.get(`/api/weekly/${monday}/auto-totals`);
    expect(response.json().totals.wk_emails).toBe(15);
  });
});

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]}`;
}

/** The nearest day with the given ISO weekday, searching in `direction`. */
function nextOfWeekday(from: string, isoDow: number, direction: 1 | -1): string {
  let day = from;
  for (let i = 0; i < 8; i += 1) {
    day = addDays(day, direction);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const iso = dow === 0 ? 7 : dow;
    if (iso === isoDow) return day;
  }
  return day;
}
