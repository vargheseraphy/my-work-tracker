/**
 * The contributor home screen (design/home.html): what is missing, this week against target,
 * open tasks, the weekly log and this week's ABM account.
 */

import type { FastifyInstance } from 'fastify';
import { weekMonday, type HomeDto, type TargetProgressDto } from '@gtm/shared';
import { many, one, withUser } from '../db.js';
import { requireUser } from '../context.js';
import { backfillDays, localToday, missingDays } from '../entries/service.js';
import { listTasks } from '../tasks/service.js';
import { readOwnedAbmAccounts } from '../abm/service.js';

export async function homeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/home', async (request) => {
    const user = requireUser(request);

    return withUser(user.id, async (client): Promise<HomeDto> => {
      const today = await localToday(client, user.id);
      const monday = weekMonday(today);

      // One connection runs one query at a time, so these are sequential on purpose.
      const missing = await missingDays(client, user.id);
      const backfill = await backfillDays(client, user.id);
      const todayEntry = await one<{ status: string }>(
        client,
        `select status from entries
          where user_id = $1 and log_type = 'daily' and period_start = $2`,
        [user.id, today],
      );
      const weeklyEntry = await one<{ status: string }>(
        client,
        `select status from entries
          where user_id = $1 and log_type = 'weekly' and period_start = $2`,
        [user.id, monday],
      );
      const openTasks = await listTasks(client, { assigneeId: user.id, openOnly: true });
      const owned = await readOwnedAbmAccounts(client, user.id);
      const targets = await readTargets(client, user.id, monday);
      const weekDays = await countWeekDays(client, user.id, monday, today);

      const weeklyOpen = await one<{ isOpen: boolean }>(
        client,
        `select local_now($1) >= ($2::date + 4 + coalesce((setting('weekly_open_time') #>> '{}')::time, '16:00')) as "isOpen"`,
        [user.id, monday],
      );

      return {
        user: { ...user, today },
        today,
        todayStatus: (todayEntry?.status as HomeDto['todayStatus']) ?? 'missing',
        missingDays: missing,
        backfillDays: backfill,
        weekMonday: monday,
        weekDaysDone: weekDays.done,
        weekDaysTotal: weekDays.total,
        targets,
        openTasks,
        weeklyStatus: (weeklyEntry?.status as HomeDto['weeklyStatus']) ?? 'missing',
        weeklyIsOpen: weeklyOpen?.isOpen ?? false,
        abmThisWeek: owned.find((a) => a.plannedWeek === monday) ?? null,
        streak: await countStreak(client, user.id, today),
      };
    });
  });
}

/** This week's actual against target for every target measure (DSH-02, home). */
export async function readTargets(
  client: Parameters<typeof many>[0],
  userId: string,
  monday: string,
): Promise<TargetProgressDto[]> {
  return many<TargetProgressDto>(
    client,
    `select w.metric_key as "metricKey", md.label, w.actual, w.target
       from dashboard_week($2) w
       join metric_definitions md on md.key = w.metric_key
      where w.user_id = $1
      order by md.sort_order`,
    [userId, monday],
  );
}

/**
 * Working days of this week that are already finished, and how many the week holds.
 * Today counts as done only once its entry is submitted, which is what "pace" means.
 */
export async function countWeekDays(
  client: Parameters<typeof one>[0],
  userId: string,
  monday: string,
  today: string,
): Promise<{ done: number; total: number }> {
  const row = await one<{ done: number; total: number }>(
    client,
    `select
       (select count(*)::int from working_days_between($1, $2::date, $2::date + 4) d
         where d < $3::date
            or exists (select 1 from entries e
                        where e.user_id = $1 and e.log_type = 'daily' and e.period_start = d
                          and e.status in ('submitted', 'late'))) as done,
       (select count(*)::int from working_days_between($1, $2::date, $2::date + 4)) as total`,
    [userId, monday, today],
  );
  return { done: row?.done ?? 0, total: row?.total ?? 5 };
}

/** Consecutive working days signed off, counting back from the last finished working day. */
async function countStreak(
  client: Parameters<typeof many>[0],
  userId: string,
  today: string,
): Promise<number> {
  const days = await many<{ d: string; submitted: boolean }>(
    client,
    `select d, exists (select 1 from entries e
                        where e.user_id = $1 and e.log_type = 'daily' and e.period_start = d
                          and e.status in ('submitted', 'late')) as submitted
       from working_days_between($1, $2::date - 90, $2::date) d
      order by d desc`,
    [userId, today],
  );

  let streak = 0;
  for (const day of days) {
    // Today does not break a streak until its deadline has passed.
    if (day.d === today && !day.submitted) continue;
    if (!day.submitted) break;
    streak += 1;
  }
  return streak;
}
