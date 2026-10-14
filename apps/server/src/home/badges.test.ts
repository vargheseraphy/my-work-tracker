/**
 * contributor_badges and award_meetings (db/migrations/0011).
 *
 * Badges are derived on read, so the thing to prove is that they follow the data exactly, and
 * that a tier once reached cannot be lost by a later quiet week.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeOwner, makeUser, owner, resetDatabase } from '../test/helpers.js';

interface Badge {
  key: string;
  value: number;
  tier: number;
  next_threshold: number | null;
}

async function badges(userId: string): Promise<Record<string, Badge>> {
  const client = await owner();
  const result = await client.query<Badge>(
    'select key, value, tier, next_threshold from contributor_badges($1)',
    [userId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.key, row]));
}

/** A submitted weekly log carrying `meetings` in wk_meetings. */
async function weeklyWithMeetings(
  userId: string,
  monday: string,
  meetings: number,
): Promise<string> {
  const client = await owner();
  const entry = await client.query<{ id: string }>(
    `insert into entries (user_id, log_type, period_start) values ($1, 'weekly', $2) returning id`,
    [userId, monday],
  );
  const id = entry.rows[0]!.id;
  await client.query(
    `insert into entry_values (entry_id, metric_key, num_value) values ($1, 'wk_meetings', $2)`,
    [id, meetings],
  );
  await client.query(
    `update entries set status = 'submitted', submitted_at = now() where id = $1`,
    [id],
  );
  return id;
}

async function awardMeetings(entryId: string): Promise<boolean> {
  const client = await owner();
  const result = await client.query<{ awarded: boolean }>(
    'select award_meetings($1) as awarded',
    [entryId],
  );
  return result.rows[0]!.awarded;
}

async function mondayOf(userId: string): Promise<string> {
  const client = await owner();
  const result = await client.query<{ m: string }>(
    `select to_char(week_monday(local_today($1)), 'YYYY-MM-DD') as m`,
    [userId],
  );
  return result.rows[0]!.m;
}

describe('contributor_badges', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeOwner();
  });

  it('starts everyone at nothing earned, with the first tier named', async () => {
    const user = await makeUser('new@example.test');
    const result = await badges(user.id);

    expect(result.meetings!.tier).toBe(0);
    expect(result.meetings!.value).toBe(0);
    expect(result.meetings!.next_threshold).toBe(1);
  });

  it('counts meetings from submitted weekly logs', async () => {
    const user = await makeUser('met@example.test');
    await weeklyWithMeetings(user.id, await mondayOf(user.id), 6);

    const result = await badges(user.id);
    expect(result.meetings!.value).toBe(6);
    expect(result.meetings!.tier).toBe(2); // past 1 and 5
    expect(result.meetings!.next_threshold).toBe(10);
  });
});

describe('award_meetings', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeOwner();
  });

  it('says nothing when no meeting was booked', async () => {
    const user = await makeUser('nomeet@example.test');
    const entry = await weeklyWithMeetings(user.id, await mondayOf(user.id), 0);
    expect(await awardMeetings(entry)).toBe(false);
  });

  it('celebrates a booked meeting, once for that week', async () => {
    const user = await makeUser('onemeet@example.test');
    const entry = await weeklyWithMeetings(user.id, await mondayOf(user.id), 2);

    expect(await awardMeetings(entry)).toBe(true);
    expect(await awardMeetings(entry)).toBe(false);

    const client = await owner();
    const rows = await client.query<{ title: string }>(
      `select title from notifications where user_id = $1 and rule_key = 'meeting_booked'`,
      [user.id],
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0]!.title).toBe('2 meetings booked');
  });
});
