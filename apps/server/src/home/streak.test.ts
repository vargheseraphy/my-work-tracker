/**
 * contributor_streak (db/migrations/0008).
 *
 * The rules exist to encourage, so the tests are mostly about what must NOT break a run:
 * lateness, an empty today, weekends and leave.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeOwner,
  localToday,
  makeUser,
  owner,
  resetDatabase,
  seedSubmittedDay,
} from '../test/helpers.js';

interface Streak {
  current_streak: number;
  best_streak: number;
  logged_today: boolean;
  last_logged: string | null;
}

async function streakOf(userId: string): Promise<Streak> {
  const client = await owner();
  const result = await client.query<Streak>('select * from contributor_streak($1)', [userId]);
  return result.rows[0]!;
}

/** The working day n working days before `from`, so tests never assume Monday to Friday. */
async function workingDayBefore(userId: string, from: string, n: number): Promise<string> {
  const client = await owner();
  const result = await client.query<{ d: string }>(
    `select to_char(d, 'YYYY-MM-DD') as d
       from working_days_between($1, $2::date - 60, $2::date - 1) d
      order by d desc offset $3 limit 1`,
    [userId, from, n - 1],
  );
  return result.rows[0]!.d;
}

describe('contributor_streak', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeOwner();
  });

  it('counts nothing for someone who has never logged', async () => {
    const user = await makeUser('never@example.test');
    const streak = await streakOf(user.id);
    expect(streak.current_streak).toBe(0);
    expect(streak.best_streak).toBe(0);
    expect(streak.logged_today).toBe(false);
    expect(streak.last_logged).toBeNull();
  });

  it('counts consecutive working days, and an empty today does not break it', async () => {
    const user = await makeUser('run@example.test');
    const today = await localToday(user.id);

    for (let back = 1; back <= 3; back += 1) {
      await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, back));
    }

    const streak = await streakOf(user.id);
    expect(streak.current_streak).toBe(3);
    expect(streak.logged_today).toBe(false);
  });

  it('counts a late day, because punctuality is not what the streak measures', async () => {
    const user = await makeUser('late@example.test');
    const today = await localToday(user.id);

    await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, 1), {}, 'late');
    await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, 2), {}, 'submitted');

    expect((await streakOf(user.id)).current_streak).toBe(2);
  });

  it('a genuine gap ends the run but is remembered as the best', async () => {
    const user = await makeUser('gap@example.test');
    const today = await localToday(user.id);

    // Two recent days, a missed day, then three older ones.
    await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, 1));
    await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, 2));
    for (let back = 4; back <= 6; back += 1) {
      await seedSubmittedDay(user.id, await workingDayBefore(user.id, today, back));
    }

    const streak = await streakOf(user.id);
    expect(streak.current_streak).toBe(2);
    expect(streak.best_streak).toBe(3);
  });

  it('today counts as soon as it is logged', async () => {
    const user = await makeUser('today@example.test');
    const today = await localToday(user.id);

    await seedSubmittedDay(user.id, today);

    const streak = await streakOf(user.id);
    expect(streak.current_streak).toBe(1);
    expect(streak.logged_today).toBe(true);
    expect(streak.last_logged).toBe(today);
  });
});
