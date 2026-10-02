/**
 * One pass over every route group: tasks, files, ABM, notifications, admin settings, the
 * calendar, users, the dashboard and the report (BUILD.md phase 3, item 8).
 */

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Agent,
  closeOwner,
  localToday,
  makeUser,
  owner,
  PNG_1X1,
  resetDatabase,
  seedSubmittedDay,
  signIn,
  startApp,
  uniqueEmail,
  uploadProof,
  weekMondayOf,
  type TestUser,
} from './helpers.js';

let app: FastifyInstance;
let admin: TestUser;
let tanzil: TestUser;
let anil: TestUser;
let adminAgent: Agent;
let tanzilAgent: Agent;
let anilAgent: Agent;
let today: string;
let monday: string;

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
  adminAgent = await signIn(app, admin);
  tanzilAgent = await signIn(app, tanzil);
  anilAgent = await signIn(app, anil);
  today = await localToday(tanzil.id);
  monday = await weekMondayOf(today);
});

async function makeTask(assignee = tanzil, dueOffset = 0, title = 'Clean the list') {
  const response = await adminAgent.post('/api/tasks', {
    title,
    description: 'Invented task.',
    assigneeId: assignee.id,
    dueDate: addDays(today, dueOffset),
    priority: 'High',
  });
  expect(response.statusCode).toBe(201);
  return response.json().task as { id: string; title: string; status: string };
}

describe('tasks', () => {
  it('TSK-01 · an admin creates a task and the assignee is told', async () => {
    const task = await makeTask();
    expect(task.status).toBe('Not started');

    const notifications = await tanzilAgent.get('/api/notifications');
    expect(notifications.json().unread).toBe(1);
    expect(notifications.json().items[0].title).toBe('A new task is yours');
    expect(notifications.json().items[0].body).toContain('Clean the list');
  });

  it('TSK-02 · Blocked needs a note', async () => {
    const task = await makeTask();
    const withoutNote = await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Blocked',
    });
    expect(withoutNote.statusCode).toBe(409);
    expect(withoutNote.json().message).toBe('Say what is blocking you');

    const withNote = await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Blocked',
      note: 'Waiting for the CRM export.',
    });
    expect(withNote.statusCode).toBe(200);
    expect(withNote.json().task.status).toBe('Blocked');
  });

  it('TSK-02 · Done needs a link or a file', async () => {
    const task = await makeTask();
    const bare = await tanzilAgent.post(`/api/tasks/${task.id}/status`, { status: 'Done' });
    expect(bare.statusCode).toBe(409);
    expect(bare.json().message).toBe('Add a link or attach a file before marking this Done');

    const withLink = await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Done',
      note: 'Published.',
      proofUrl: 'https://example.test/done',
    });
    expect(withLink.statusCode).toBe(200);
    expect(withLink.json().task.completedAt).not.toBeNull();
  });

  it('refuses a proof link that is not https', async () => {
    const task = await makeTask();
    const response = await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Done',
      proofUrl: 'http://example.test/done',
    });
    expect(response.statusCode).toBe(400);
  });

  it('TSK-03 · keeps the history', async () => {
    const task = await makeTask();
    await tanzilAgent.post(`/api/tasks/${task.id}/status`, { status: 'In progress' });
    await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Blocked',
      note: 'Stuck on the export.',
    });

    const detail = await tanzilAgent.get(`/api/tasks/${task.id}`);
    const updates = detail.json().task.updates as { status: string; byName: string }[];
    expect(updates).toHaveLength(2);
    expect(updates[0]!.status).toBe('Blocked');
    expect(updates[0]!.byName).toBe('Tanzil');
    expect(updates[1]!.status).toBe('In progress');
  });

  it('TSK-04 · an admin reassigns, moves the due date and cancels', async () => {
    const task = await makeTask();

    const reassigned = await adminAgent.patch(`/api/tasks/${task.id}`, {
      assigneeId: anil.id,
      dueDate: addDays(today, 5),
      priority: 'Low',
    });
    expect(reassigned.json().task.assigneeName).toBe('Anil');
    expect(reassigned.json().task.priority).toBe('Low');

    // The new assignee is told as well.
    const anilNotifications = await anilAgent.get('/api/notifications');
    expect(anilNotifications.json().items[0].title).toBe('A task was passed to you');

    const cancelled = await adminAgent.patch(`/api/tasks/${task.id}`, { cancel: true });
    expect(cancelled.json().task.status).toBe('Cancelled');
  });

  it('only an admin may cancel', async () => {
    const task = await makeTask();
    const response = await tanzilAgent.post(`/api/tasks/${task.id}/status`, {
      status: 'Cancelled',
      note: 'Not doing it',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('Only an admin can cancel a task');
  });

  it('marks an overdue task as overdue', async () => {
    await makeTask(tanzil, -3, 'Late one');
    const list = await tanzilAgent.get('/api/tasks');
    const task = list.json().tasks[0];
    expect(task.isOverdue).toBe(true);
    expect(task.isDueToday).toBe(false);
  });

  it('a contributor sees only their own tasks, an admin sees all', async () => {
    await makeTask(tanzil, 0, 'Tanzil task');
    await makeTask(anil, 0, 'Anil task');

    expect((await tanzilAgent.get('/api/tasks')).json().tasks).toHaveLength(1);
    expect((await adminAgent.get('/api/tasks')).json().tasks).toHaveLength(2);
    expect((await adminAgent.get(`/api/tasks?owner=${anil.id}`)).json().tasks).toHaveLength(1);
  });
});

describe('files', () => {
  it('DAY-04 · uploads, lists and streams a screenshot', async () => {
    const opened = await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });
    const entryId = opened.json().entry.id as string;

    expect(await uploadProof(tanzilAgent, entryId, 'comments')).toBe(201);

    const screen = await tanzilAgent.get(`/api/entries/screen/daily/${today}`);
    const attachments = screen.json().entry.attachments as { id: string; url: string }[];
    expect(attachments).toHaveLength(1);

    const file = await tanzilAgent.get(attachments[0]!.url);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.rawPayload.equals(PNG_1X1)).toBe(true);
  });

  it('refuses a file whose real type is not allowed, whatever the browser claims', async () => {
    const opened = await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });
    const entryId = opened.json().entry.id as string;

    const boundary = '----gtmtest';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="metricKey"\r\n\r\ncomments\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.png"\r\n` +
          `Content-Type: image/png\r\n\r\n`,
      ),
      Buffer.from('<?php echo "not a png"; ?>'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await tanzilAgent.request({
      method: 'POST',
      url: `/api/entries/${entryId}/attachments`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().fields.file).toBe('Attach a PNG, JPEG, WebP or PDF');
  });

  it('DAY-11 · allows at most five files for one field', async () => {
    const opened = await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });
    const entryId = opened.json().entry.id as string;

    for (let i = 0; i < 5; i += 1) {
      expect(await uploadProof(tanzilAgent, entryId, 'comments')).toBe(201);
    }
    expect(await uploadProof(tanzilAgent, entryId, 'comments')).toBe(409);
  });

  it('will not stream another person’s file', async () => {
    const opened = await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });
    const entryId = opened.json().entry.id as string;
    await uploadProof(tanzilAgent, entryId, 'comments');

    const screen = await tanzilAgent.get(`/api/entries/screen/daily/${today}`);
    const url = screen.json().entry.attachments[0].url as string;

    expect((await anilAgent.get(url)).statusCode).toBe(404);
    // An admin may look at proof.
    expect((await adminAgent.get(url)).statusCode).toBe(200);
  });

  it('deletes a file and its row', async () => {
    const opened = await tanzilAgent.post('/api/entries/open', { type: 'daily', period: today });
    const entryId = opened.json().entry.id as string;
    await uploadProof(tanzilAgent, entryId, 'comments');

    const screen = await tanzilAgent.get(`/api/entries/screen/daily/${today}`);
    const id = screen.json().entry.attachments[0].id as string;

    expect((await tanzilAgent.delete(`/api/attachments/${id}`)).statusCode).toBe(204);
    expect((await tanzilAgent.get(`/api/files/${id}`)).statusCode).toBe(404);
  });
});

describe('ABM', () => {
  async function addAccount(ownerUser = tanzil, weeksAgo = 0, name = '[Account A]') {
    const response = await adminAgent.post('/api/abm', {
      name,
      vertical: 'Yallo Talent',
      region: 'UAE',
      ownerId: ownerUser.id,
      plannedWeek: addDays(monday, -7 * weeksAgo),
    });
    expect(response.statusCode).toBe(201);
    return response.json().account as { id: string; stage: string };
  }

  it('ABM-01 · an admin adds an account', async () => {
    const account = await addAccount();
    expect(account.stage).toBe('Research');

    const screen = await tanzilAgent.get('/api/abm');
    expect(screen.json().accounts).toHaveLength(1);
    expect(screen.json().accounts[0].ownerName).toBe('Tanzil');
  });

  it('ABM-02 · the owner moves the stage and the time is recorded', async () => {
    const account = await addAccount();
    const response = await tanzilAgent.patch(`/api/abm/${account.id}`, { stage: 'Live' });
    expect(response.json().account.stage).toBe('Live');
    expect(response.json().account.isLive).toBe(true);
    expect(response.json().account.liveAt).not.toBeNull();
  });

  it('ABM-03 · the week strip flags a past week with no account', async () => {
    await addAccount(tanzil, 1);
    const screen = await adminAgent.get('/api/abm');
    const plan = screen.json().weekPlan as { week: string; missed: boolean; account: unknown }[];

    expect(plan).toHaveLength(12);
    expect(plan.at(-1)!.week).toBe(monday);
    const lastWeek = plan.find((w) => w.week === addDays(monday, -7))!;
    expect(lastWeek.account).not.toBeNull();
    expect(lastWeek.missed).toBe(true); // added but never taken live

    const twoWeeksAgo = plan.find((w) => w.week === addDays(monday, -14))!;
    expect(twoWeeksAgo.account).toBeNull();
    expect(twoWeeksAgo.missed).toBe(true);
  });

  it('a week counts as hit once the account is live', async () => {
    const account = await addAccount(tanzil, 1);
    await tanzilAgent.patch(`/api/abm/${account.id}`, { stage: 'Live' });

    const screen = await adminAgent.get('/api/abm');
    const plan = screen.json().weekPlan as { week: string; missed: boolean }[];
    expect(plan.find((w) => w.week === addDays(monday, -7))!.missed).toBe(false);
  });

  it('ABM-04 · records weekly touches', async () => {
    const account = await addAccount();
    const response = await tanzilAgent.put(`/api/abm/${account.id}/touches/${monday}`, {
      emails: 4,
      messages: 2,
      calls: 1,
    });
    expect(response.json().touches).toMatchObject({ emails: 4, messages: 2, calls: 1 });

    // A second write replaces, it does not add a row.
    await tanzilAgent.put(`/api/abm/${account.id}/touches/${monday}`, {
      emails: 9,
      messages: 2,
      calls: 1,
    });
    const screen = await tanzilAgent.get('/api/abm');
    expect(screen.json().touches).toHaveLength(1);
    expect(screen.json().touches[0].emails).toBe(9);
  });
});

describe('notifications', () => {
  it('NTF-03 · counts unread and marks one read', async () => {
    await makeTask();
    const before = await tanzilAgent.get('/api/notifications');
    expect(before.json().unread).toBe(1);

    const id = before.json().items[0].id as string;
    expect((await tanzilAgent.post(`/api/notifications/${id}/read`)).statusCode).toBe(200);

    const after = await tanzilAgent.get('/api/notifications');
    expect(after.json().unread).toBe(0);
    expect(after.json().items[0].readAt).not.toBeNull();
  });

  it('marks everything read at once', async () => {
    await makeTask(tanzil, 0, 'One');
    await makeTask(tanzil, 1, 'Two');
    expect((await tanzilAgent.get('/api/notifications')).json().unread).toBe(2);

    await tanzilAgent.post('/api/notifications/read-all');
    expect((await tanzilAgent.get('/api/notifications')).json().unread).toBe(0);
  });
});

describe('admin settings', () => {
  it('ADM-01 · sets a weekly target that then shows on the dashboard', async () => {
    await adminAgent.put('/api/admin/settings/targets', {
      targets: [{ userId: tanzil.id, metricKey: 'emails', weeklyTarget: 150 }],
    });

    const settings = await adminAgent.get('/api/admin/settings');
    const row = (settings.json().settings as { metricKey: string; weeklyTarget: number }[]).find(
      (s) => s.metricKey === 'emails',
    );
    expect(row!.weeklyTarget).toBe(150);

    const week = await adminAgent.get(`/api/admin/week?monday=${monday}`);
    const person = week.json().people.find((p: { userId: string }) => p.userId === tanzil.id);
    const emails = person.targets.find((t: { metricKey: string }) => t.metricKey === 'emails');
    expect(emails.target).toBe(150);
  });

  it('ADM-02 · turning a field off removes it from that person’s next log', async () => {
    const before = await tanzilAgent.get(`/api/entries/screen/daily/${today}`);
    expect(before.json().fields.map((f: { key: string }) => f.key)).toContain('posters');

    await adminAgent.put('/api/admin/settings/fields', {
      fields: [{ userId: tanzil.id, metricKey: 'posters', enabled: false }],
    });

    const after = await tanzilAgent.get(`/api/entries/screen/daily/${today}`);
    expect(after.json().fields.map((f: { key: string }) => f.key)).not.toContain('posters');

    // And it is still there for everybody else.
    const other = await anilAgent.get(`/api/entries/screen/daily/${await localToday(anil.id)}`);
    expect(other.json().fields.map((f: { key: string }) => f.key)).toContain('posters');
  });

  it('ADM-03 · changes a reminder time and an app setting', async () => {
    await adminAgent.put('/api/admin/settings/reminders', {
      rules: [
        { key: 'daily_deadline', localTime: '20:30', email: true, inApp: true, active: false },
      ],
    });
    await adminAgent.put('/api/admin/settings/app', {
      dailyDueTime: '20:00',
      reportRecipients: ['raphy@example.test'],
    });

    const settings = await adminAgent.get('/api/admin/settings');
    const rule = (settings.json().reminders as { key: string; localTime: string; active: boolean }[]).find(
      (r) => r.key === 'daily_deadline',
    );
    expect(rule).toMatchObject({ localTime: '20:30', active: false });
    expect(settings.json().app.dailyDueTime).toBe('20:00');
    expect(settings.json().app.reportRecipients).toEqual(['raphy@example.test']);
  });

  it('refuses a reminder time that is not HH:MM', async () => {
    const response = await adminAgent.put('/api/admin/settings/reminders', {
      rules: [{ key: 'daily_deadline', localTime: '8pm', email: true, inApp: true, active: true }],
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('ADM-04 · holidays and leave', () => {
  it('adds a holiday, which stops that day showing as missing', async () => {
    const yesterday = addDays(today, -1);
    const before = await tanzilAgent.get('/api/home');
    expect(before.json().missingDays).toContain(yesterday);

    const created = await adminAgent.post('/api/admin/calendar', {
      day: yesterday,
      kind: 'holiday',
      label: 'Public holiday',
    });
    expect(created.statusCode).toBe(201);

    const after = await tanzilAgent.get('/api/home');
    expect(after.json().missingDays).not.toContain(yesterday);
  });

  it('adds leave for one person only', async () => {
    const yesterday = addDays(today, -1);
    await adminAgent.post('/api/admin/calendar', {
      day: yesterday,
      kind: 'leave',
      label: 'Annual leave',
      userId: tanzil.id,
    });

    expect((await tanzilAgent.get('/api/home')).json().missingDays).not.toContain(yesterday);
    expect((await anilAgent.get('/api/home')).json().missingDays).toContain(yesterday);
  });

  it('refuses a holiday aimed at one person, or leave aimed at everyone', async () => {
    expect(
      (await adminAgent.post('/api/admin/calendar', {
        day: today,
        kind: 'holiday',
        label: 'Mine only',
        userId: tanzil.id,
      })).statusCode,
    ).toBe(400);

    expect(
      (await adminAgent.post('/api/admin/calendar', {
        day: today,
        kind: 'leave',
        label: 'Everyone off',
      })).statusCode,
    ).toBe(400);
  });

  it('removes a holiday again', async () => {
    const created = await adminAgent.post('/api/admin/calendar', {
      day: addDays(today, -1),
      kind: 'holiday',
      label: 'Public holiday',
    });
    const id = created.json().day.id as string;
    expect((await adminAgent.delete(`/api/admin/calendar/${id}`)).statusCode).toBe(204);
    expect((await adminAgent.get('/api/admin/calendar')).json().days).toHaveLength(0);
  });
});

describe('ADM-05 · users', () => {
  it('invites someone and lists them', async () => {
    const email = uniqueEmail('new');
    const response = await adminAgent.post('/api/admin/users/invite', {
      email,
      fullName: 'New Person',
      role: 'contributor',
      timezone: 'Asia/Dubai',
    });
    expect(response.statusCode).toBe(201);

    const users = await adminAgent.get('/api/admin/users');
    const found = (users.json().users as { email: string; timezone: string }[]).find(
      (u) => u.email === email,
    );
    expect(found!.timezone).toBe('Asia/Dubai');
  });

  it('refuses an address outside the allowed domains', async () => {
    const response = await adminAgent.post('/api/admin/users/invite', {
      email: 'someone@elsewhere.test',
      fullName: 'Outsider',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().fields.email).toContain('example.test');
  });

  it('refuses a second invite for the same address', async () => {
    const email = uniqueEmail('twice');
    await adminAgent.post('/api/admin/users/invite', { email, fullName: 'Once' });
    const again = await adminAgent.post('/api/admin/users/invite', { email, fullName: 'Twice' });
    expect(again.statusCode).toBe(409);
  });

  it('AUTH-04 · deactivating someone ends their session at once', async () => {
    expect((await anilAgent.get('/api/auth/me')).statusCode).toBe(200);

    const response = await adminAgent.patch(`/api/admin/users/${anil.id}`, { active: false });
    expect(response.json().user.active).toBe(false);
    expect((await anilAgent.get('/api/auth/me')).statusCode).toBe(401);
  });
});

describe('the dashboard', () => {
  it('DSH-01 · builds the compliance grid for a month', async () => {
    const submittedDay = addDays(today, -1);
    const lateDay = addDays(today, -2);
    await seedSubmittedDay(tanzil.id, submittedDay, { emails: 20 });
    await seedSubmittedDay(tanzil.id, lateDay, { emails: 15 }, 'late');

    // Those two days can straddle a month end, so each is checked in its own month's grid.
    const cellFor = async (day: string): Promise<string> => {
      const response = await adminAgent.get(`/api/admin/compliance?month=${day.slice(0, 7)}`);
      expect(response.statusCode).toBe(200);
      const people = response.json().people as {
        userId: string;
        cells: { day: string; status: string }[];
      }[];
      const person = people.find((p) => p.userId === tanzil.id)!;
      return person.cells.find((c) => c.day === day)!.status;
    };

    expect(await cellFor(submittedDay)).toBe('submitted');
    expect(await cellFor(lateDay)).toBe('late');
    expect(await cellFor(today)).toBe('due');

    // The month totals add up for whichever month today falls in.
    const thisMonth = await adminAgent.get(`/api/admin/compliance?month=${today.slice(0, 7)}`);
    const person = (thisMonth.json().people as { userId: string; expected: number }[]).find(
      (p) => p.userId === tanzil.id,
    )!;
    expect(person.expected).toBeGreaterThan(0);
    expect(thisMonth.json().days.length).toBeGreaterThanOrEqual(28);
  });

  it('DSH-03 and DSH-04 · returns outcomes and a 12-week impressions trend', async () => {
    const response = await adminAgent.get(`/api/admin/week?monday=${monday}`);
    const body = response.json();
    expect(body.impressions).toHaveLength(12);
    expect(body.outcomes).toHaveLength(8);
    expect(body.impressions.at(-1).week).toBe(monday);
    expect(body.kpis).toHaveProperty('openTasks');
  });

  it('DSH-06 · shows a person’s recent days with their proof, and unlocks one', async () => {
    const entryId = await seedSubmittedDay(tanzil.id, addDays(today, -1), { comments: 5 });
    const client = await owner();
    await client.query(
      `insert into attachments (owner_id, entry_id, metric_key, storage_path, file_name, mime_type, size_bytes)
       values ($1, $2, 'comments', $3, 'x.png', 'image/png', 100)`,
      [tanzil.id, entryId, `${tanzil.id}/${entryId}/x.png`],
    );

    const person = await adminAgent.get(`/api/admin/people/${tanzil.id}?days=5`);
    expect(person.statusCode).toBe(200);
    const day = (person.json().days as { day: string; attachments: unknown[] }[]).find(
      (d) => d.day === addDays(today, -1),
    )!;
    expect(day.attachments).toHaveLength(1);

    const unlock = await adminAgent.post('/api/admin/unlock', {
      userId: tanzil.id,
      type: 'daily',
      period: addDays(today, -1),
      reason: 'The email count looked wrong.',
    });
    expect(unlock.json().entry.status).toBe('unlocked');

    // And the person is told.
    const notifications = await tanzilAgent.get('/api/notifications');
    expect(notifications.json().items[0].title).toContain('was unlocked');
    expect(notifications.json().items[0].body).toBe('Reason: The email count looked wrong.');
  });

  it('an unlock needs a reason', async () => {
    const response = await adminAgent.post('/api/admin/unlock', {
      userId: tanzil.id,
      type: 'daily',
      period: today,
      reason: '  ',
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('the report and the export', () => {
  it('RPT-01 · builds a week report', async () => {
    await seedSubmittedDay(tanzil.id, monday, { emails: 30, replies: 4 });
    const response = await adminAgent.get(`/api/admin/report?monday=${monday}`);
    expect(response.statusCode).toBe(200);

    const report = response.json().report;
    expect(report.monday).toBe(monday);
    expect(report.range).toMatch(/ to /);
    expect(report.totals.emails).toBe(30);
    expect(report.totals.replies).toBe(4);
    expect(report.people.map((p: { fullName: string }) => p.fullName).sort()).toEqual([
      'Anil',
      'Tanzil',
    ]);
  });

  it('RPT-03 · exports the month as CSV with days as columns', async () => {
    await seedSubmittedDay(tanzil.id, addDays(today, -1), { emails: 12 });

    const response = await adminAgent.get(`/api/admin/export.csv?month=${today.slice(0, 7)}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(String(response.headers['content-disposition'])).toContain('attachment');

    const lines = response.body.split('\r\n');
    expect(lines[0]).toMatch(/^\uFEFF?Person,Measure,01,02/);
    const emailsRow = lines.find((l) => l.startsWith('Tanzil,Emails sent'));
    expect(emailsRow).toBeDefined();
    expect(emailsRow!.endsWith(',12')).toBe(true);
  });
});

describe('the home screen', () => {
  it('reports what is missing and this week’s pace', async () => {
    await seedSubmittedDay(tanzil.id, addDays(today, -1), { emails: 20 });
    await adminAgent.put('/api/admin/settings/targets', {
      targets: [{ userId: tanzil.id, metricKey: 'emails', weeklyTarget: 100 }],
    });

    const response = await tanzilAgent.get('/api/home');
    const body = response.json();
    expect(body.today).toBe(today);
    expect(body.todayStatus).toBe('missing');
    expect(body.missingDays).not.toContain(addDays(today, -1));
    expect(body.weekMonday).toBe(monday);
    expect(body.weekDaysTotal).toBeGreaterThan(0);

    const emails = body.targets.find((t: { metricKey: string }) => t.metricKey === 'emails');
    expect(emails.target).toBe(100);
  });
});

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
