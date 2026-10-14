/**
 * The contributor home screen (design/home.html): what is missing, this week against target,
 * open tasks, the weekly log and this week's ABM account.
 */

import type { FastifyInstance } from 'fastify';
import {
  weekMonday,
  type CelebrationDto,
  type HomeDto,
  type StreakDto,
  type TargetProgressDto,
} from '@gtm/shared';
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

      const working = await one<{ isWorkingDay: boolean }>(
        client,
        'select is_working_day($1, $2) as "isWorkingDay"',
        [user.id, today],
      );

      const weeklyOpen = await one<{ isOpen: boolean }>(
        client,
        `select local_now($1) >= ($2::date + 4 + coalesce((setting('weekly_open_time') #>> '{}')::time, '16:00')) as "isOpen"`,
        [user.id, monday],
      );

      return {
        user: { ...user, today },
        today,
        todayIsWorkingDay: working?.isWorkingDay ?? false,
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
        streak: await countStreak(client, user.id),
        celebration: await readCelebration(client, user.id),
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

/** Milestones worth celebrating, in working days. Reachable, then satisfying, then rare. */
export const STREAK_MILESTONES = [3, 5, 10, 20, 40, 60, 100] as const;

/**
 * The run itself is counted by contributor_streak() in the database (db/migrations/0008), not
 * here: it is a rule about the business, and rules live in SQL where row-level security applies.
 */
async function countStreak(
  client: Parameters<typeof many>[0],
  userId: string,
): Promise<StreakDto> {
  const row = await one<{
    current: number;
    best: number;
    loggedToday: boolean;
    lastLogged: string | null;
  }>(
    client,
    `select current_streak as "current", best_streak as "best",
            logged_today as "loggedToday", last_logged as "lastLogged"
       from contributor_streak($1)`,
    [userId],
  );

  const current = row?.current ?? 0;
  return {
    current,
    best: row?.best ?? 0,
    loggedToday: row?.loggedToday ?? false,
    lastLogged: row?.lastLogged ?? null,
    nextMilestone: STREAK_MILESTONES.find((m) => m > current) ?? null,
  };
}

/**
 * The newest unread win. Reading it is what dismisses it, so a person is congratulated once and
 * never pestered about the same week twice.
 */
async function readCelebration(
  client: Parameters<typeof one>[0],
  userId: string,
): Promise<CelebrationDto | null> {
  const row = await one<CelebrationDto>(
    client,
    `select id, title, body
       from notifications
      where user_id = $1 and rule_key = 'week_target_met' and read_at is null
      order by created_at desc
      limit 1`,
    [userId],
  );
  return row ?? null;
}
