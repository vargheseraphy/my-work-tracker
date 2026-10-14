/**
 * award_week_target (db/migrations/0010).
 *
 * The contributor is told "your manager has been told", so the test that matters most is that
 * an admin row really exists. A promise the app cannot keep is worse than saying nothing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeOwner, localToday, makeUser, owner, resetDatabase } from '../test/helpers.js';

/** Give one person one target, and the week's actual to go with it. */
async function setTarget(userId: string, metric: string, target: number): Promise<void> {
  const client = await owner();
  await client.query(
    `insert into user_metric_settings (user_id, metric_key, enabled, weekly_target)
     values ($1, $2, true, $3)
     on conflict (user_id, metric_key) do update set enabled = true, weekly_target = $3`,
    [userId, metric, target],
  );
}

/** A submitted day carrying `value` of `metric`, so dashboard_week counts it. */
async function logValue(userId: string, day: string, metric: string, value: number): Promise<void> {
  const client = await owner();
  const entry = await client.query<{ id: string }>(
    `insert into entries (user_id, log_type, period_start) values ($1, 'daily', $2) returning id`,
    [userId, day],
  );
  const id = entry.rows[0]!.id;
  await client.query(
    `insert into entry_values (entry_id, metric_key, num_value)
     select $1, key, 0 from metric_definitions where log_type = 'daily'`,
    [id],
  );
  await client.query(
    'update entry_values set num_value = $3 where entry_id = $1 and metric_key = $2',
    [id, metric, value],
  );
  await client.query(
    `update entries set status = 'submitted', submitted_at = now() where id = $1`,
    [id],
  );
}

/**
 * Award it the way the server does: with app.user_id set. dashboard_week(), which the award
 * reads through, is scoped to auth.uid(), so without a user in scope it sees no rows at all.
 */
async function award(userId: string): Promise<boolean> {
  const client = await owner();
  await client.query("select set_config('app.user_id', $1, false)", [userId]);
  try {
    const result = await client.query<{ awarded: boolean }>(
      'select award_week_target($1) as awarded',
      [userId],
    );
    return result.rows[0]!.awarded;
  } finally {
    await client.query("select set_config('app.user_id', '', false)");
  }
}

async function notificationsFor(userId: string): Promise<number> {
  const client = await owner();
  const result = await client.query(
    `select 1 from notifications where user_id = $1 and rule_key = 'week_target_met'`,
    [userId],
  );
  return result.rowCount ?? 0;
}

describe('award_week_target', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeOwner();
  });

  it('awards nothing when the target has not been reached', async () => {
    const user = await makeUser('under@example.test');
    await setTarget(user.id, 'emails', 10);
    await logValue(user.id, await localToday(user.id), 'emails', 4);

    expect(await award(user.id)).toBe(false);
    expect(await notificationsFor(user.id)).toBe(0);
  });

  it('awards nothing to someone with no targets set', async () => {
    const user = await makeUser('notargets@example.test');
    await logValue(user.id, await localToday(user.id), 'emails', 99);

    expect(await award(user.id)).toBe(false);
  });

  it('tells the contributor and every active admin when the week is complete', async () => {
    const admin = await makeUser('boss@example.test', { role: 'admin' });
    const other = await makeUser('boss2@example.test', { role: 'admin' });
    const user = await makeUser('hit@example.test');

    await setTarget(user.id, 'emails', 10);
    await logValue(user.id, await localToday(user.id), 'emails', 12);

    expect(await award(user.id)).toBe(true);
    expect(await notificationsFor(user.id)).toBe(1);
    // The promise made on screen: both managers really do have a row.
    expect(await notificationsFor(admin.id)).toBe(1);
    expect(await notificationsFor(other.id)).toBe(1);
  });

  it('awards once only, so nobody is congratulated twice for the same week', async () => {
    const admin = await makeUser('boss3@example.test', { role: 'admin' });
    const user = await makeUser('once@example.test');

    await setTarget(user.id, 'emails', 5);
    await logValue(user.id, await localToday(user.id), 'emails', 9);

    expect(await award(user.id)).toBe(true);
    expect(await award(user.id)).toBe(false);
    expect(await notificationsFor(user.id)).toBe(1);
    expect(await notificationsFor(admin.id)).toBe(1);
  });
});
