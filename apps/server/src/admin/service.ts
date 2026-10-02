import type {
  AppSettingsDto,
  CalendarDayDto,
  ComplianceDto,
  CompliancePersonDto,
  DashboardDto,
  PersonDayDto,
  PersonDetailDto,
  Profile,
  ReminderRuleDto,
  UserSettingRowDto,
  WeekOutcomeDto,
} from '@gtm/shared';
import { addDays, daysInMonth, type MetricDefinition } from '@gtm/shared';
import { many, one, type PoolClient } from '../db.js';
import { notFound } from '../errors.js';
import { METRIC_COLUMNS, readAttachments, readValues } from '../entries/service.js';
import { buildWeekPlan, listAccounts } from '../abm/service.js';
import { countWeekDays, readTargets } from '../home/routes.js';

const PROFILE_COLUMNS = `
  id, email, full_name as "fullName", role, timezone,
  work_days as "workDays", start_date as "startDate", active`;

export async function listProfiles(client: PoolClient): Promise<Profile[]> {
  return many<Profile>(client, `select ${PROFILE_COLUMNS} from profiles order by full_name`);
}

/** DSH-01 · the person-by-day grid for a month. */
export async function compliance(client: PoolClient, month: string): Promise<ComplianceDto> {
  const rows = await many<{
    userId: string;
    fullName: string;
    day: string;
    status: CompliancePersonDto['cells'][number]['status'];
  }>(
    client,
    `select user_id as "userId", full_name as "fullName", day, status
       from dashboard_compliance($1::date) order by full_name, day`,
    [`${month}-01`],
  );

  const days = daysInMonth(month);
  const byPerson = new Map<string, CompliancePersonDto>();

  for (const row of rows) {
    let person = byPerson.get(row.userId);
    if (!person) {
      person = {
        userId: row.userId,
        fullName: row.fullName,
        cells: [],
        submitted: 0,
        late: 0,
        missing: 0,
        expected: 0,
      };
      byPerson.set(row.userId, person);
    }
    person.cells.push({ day: row.day, status: row.status });
    if (row.status === 'submitted') person.submitted += 1;
    if (row.status === 'late') person.late += 1;
    if (row.status === 'missing') person.missing += 1;
    if (['submitted', 'late', 'missing', 'due'].includes(row.status)) person.expected += 1;
  }

  return { month, days, people: [...byPerson.values()] };
}

/** DSH-02 to DSH-05 · the manager dashboard for one week. */
export async function dashboard(
  client: PoolClient,
  monday: string,
  adminId: string,
): Promise<DashboardDto> {
  const people = (await listProfiles(client)).filter(
    (p) => p.active && p.role === 'contributor',
  );

  // One connection runs one query at a time, so everything here is sequential on purpose.
  const perPerson = [];
  for (const p of people) {
    perPerson.push({
      userId: p.id,
      fullName: p.fullName,
      targets: await readTargets(client, p.id, monday),
    });
  }

  const outcomes = await weekOutcomes(client, monday, 8);
  const impressions = await impressionsTrend(client, monday, 12);
  const tasks = await taskCounts(client);
  const accounts = await listAccounts(client);
  const searchRows = await recentSearchActivities(client, monday);
  const weekDays = await countWeekDays(client, adminId, monday, monday);
  const todayCount = await one<{ submitted: number; expected: number }>(
    client,
    `select
       count(*) filter (where status in ('submitted', 'late'))::int as submitted,
       count(*)::int as expected
     from dashboard_compliance($1::date)
     where status in ('submitted', 'late', 'missing', 'due')`,
    [monday],
  );

  const thisWeek = outcomes.find((o) => o.week === monday);
  const weekPlan = buildWeekPlan(accounts, monday);

  return {
    monday,
    weekDaysDone: weekDays.done,
    weekDaysTotal: weekDays.total,
    people: perPerson,
    outcomes,
    impressions,
    kpis: {
      complianceRate:
        todayCount && todayCount.expected > 0
          ? Math.round((todayCount.submitted / todayCount.expected) * 100)
          : 0,
      submittedToday: todayCount?.submitted ?? 0,
      peopleCount: people.length,
      openTasks: tasks.open,
      overdueTasks: tasks.overdue,
      abmLiveThisWeek: weekPlan.at(-1)?.account?.isLive ?? false,
      meetingsThisWeek: thisWeek?.meetings ?? 0,
      repliesThisWeek: thisWeek?.replies ?? 0,
    },
    abm: weekPlan,
    searchActivities: searchRows,
  };
}

/** DSH-03 · outcomes week on week. */
export async function weekOutcomes(
  client: PoolClient,
  monday: string,
  weeks: number,
): Promise<WeekOutcomeDto[]> {
  const from = addDays(monday, -7 * (weeks - 1));
  const rows = await many<{
    week: string;
    meetings: number;
    replies: number;
    accountsAdded: number;
    emails: number;
  }>(
    client,
    `with weeks as (
       select generate_series($1::date, $2::date, interval '7 days')::date as week
     ),
     daily as (
       select week_monday(e.period_start) as week, ev.metric_key, sum(ev.num_value) as total
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.log_type = 'daily' and e.status in ('submitted', 'late')
          and e.period_start between $1::date and $2::date + 6
        group by 1, 2
     ),
     weekly as (
       select e.period_start as week, ev.metric_key, sum(ev.num_value) as total
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.log_type = 'weekly' and e.status in ('submitted', 'late')
          and e.period_start between $1::date and $2::date
        group by 1, 2
     )
     select w.week,
       coalesce((select total from weekly where week = w.week and metric_key = 'wk_meetings'), 0)::int as meetings,
       coalesce((select total from daily  where week = w.week and metric_key = 'replies'), 0)::int as replies,
       coalesce((select total from daily  where week = w.week and metric_key = 'accounts_added'), 0)::int as "accountsAdded",
       coalesce((select total from daily  where week = w.week and metric_key = 'emails'), 0)::int as emails
     from weeks w order by w.week`,
    [from, monday],
  );
  return rows;
}

/** DSH-04 · the 12-week impressions trend. */
export async function impressionsTrend(
  client: PoolClient,
  monday: string,
  weeks: number,
): Promise<{ week: string; total: number }[]> {
  const from = addDays(monday, -7 * (weeks - 1));
  return many<{ week: string; total: number }>(
    client,
    `with weeks as (
       select generate_series($1::date, $2::date, interval '7 days')::date as week
     )
     select w.week,
            coalesce((select sum(ev.num_value)::int
                        from entries e join entry_values ev on ev.entry_id = e.id
                       where e.log_type = 'weekly' and e.period_start = w.week
                         and e.status in ('submitted', 'late')
                         and ev.metric_key = 'wk_impressions'), 0) as total
       from weeks w order by w.week`,
    [from, monday],
  );
}

export async function taskCounts(
  client: PoolClient,
): Promise<{ open: number; overdue: number; doneThisWeek: number }> {
  const row = await one<{ open: number; overdue: number; doneThisWeek: number }>(
    client,
    `select
       count(*) filter (where status not in ('Done', 'Cancelled'))::int as open,
       count(*) filter (where status not in ('Done', 'Cancelled')
                          and due_date < local_today(assignee_id))::int as overdue,
       count(*) filter (where status = 'Done'
                          and completed_at > now() - interval '7 days')::int as "doneThisWeek"
     from tasks`,
  );
  return row ?? { open: 0, overdue: 0, doneThisWeek: 0 };
}

export async function recentSearchActivities(
  client: PoolClient,
  monday: string,
): Promise<(DashboardDto['searchActivities'][number])[]> {
  return many<DashboardDto['searchActivities'][number]>(
    client,
    `select sa.id, sa.kind, sa.description, sa.link,
            p.full_name as "userName", e.period_start as week
       from search_activities sa
       join entries e on e.id = sa.entry_id
       join profiles p on p.id = e.user_id
      where e.period_start between $1::date - 28 and $1::date
      order by e.period_start desc, p.full_name`,
    [monday],
  );
}

/** DSH-06 · one person's recent days with their proof. */
export async function personDetail(
  client: PoolClient,
  userId: string,
  days: number,
): Promise<PersonDetailDto> {
  const profile = await one<Profile>(
    client,
    `select ${PROFILE_COLUMNS} from profiles where id = $1`,
    [userId],
  );
  if (!profile) throw notFound();

  const today = (
    await one<{ today: string }>(client, 'select local_today($1) as today', [userId])
  )!.today;

  const workingDays = await many<{ d: string }>(
    client,
    'select d from working_days_between($1, $2::date - $3::int, $2::date) d order by d desc',
    [userId, today, days * 2],
  );

  const entries = await many<{
    id: string;
    periodStart: string;
    status: PersonDayDto['status'];
    isLate: boolean;
  }>(
    client,
    `select id, period_start as "periodStart", status, is_late as "isLate"
       from entries where user_id = $1 and log_type = 'daily' and period_start >= $2::date - $3::int`,
    [userId, today, days * 2],
  );

  const dayRows: PersonDayDto[] = [];
  for (const { d } of workingDays.slice(0, days)) {
    const entry = entries.find((e) => e.periodStart === d);
    dayRows.push({
      day: d,
      entryId: entry?.id ?? null,
      status: entry ? entry.status : 'missing',
      isLate: entry?.isLate ?? false,
      values: entry ? await readValues(client, entry.id) : [],
      attachments: entry ? await readAttachments(client, { entryId: entry.id }) : [],
    });
  }

  const weeklyIds = await many<{ id: string }>(
    client,
    `select id from entries where user_id = $1 and log_type = 'weekly'
      order by period_start desc limit 6`,
    [userId],
  );

  const { readEntry } = await import('../entries/service.js');
  const weeklyEntries = [];
  for (const w of weeklyIds) weeklyEntries.push(await readEntry(client, w.id));

  const monday = (
    await one<{ m: string }>(client, 'select week_monday($1::date) as m', [today])
  )!.m;

  const { listTasks } = await import('../tasks/service.js');

  return {
    profile,
    today,
    days: dayRows,
    weeklyEntries,
    fields: await many<MetricDefinition>(
      client,
      `select ${METRIC_COLUMNS} from metric_definitions md where md.active order by md.sort_order`,
    ),
    tasks: await listTasks(client, { assigneeId: userId }),
    targets: await readTargets(client, userId, monday),
  };
}

export async function unlockEntry(
  client: PoolClient,
  input: { userId: string; type: string; period: string; reason: string },
): Promise<{ id: string; status: string }> {
  const row = await one<{ id: string; status: string }>(
    client,
    'select (unlock_entry($1, $2, $3, $4)).id as id, (unlock_entry($1, $2, $3, $4)).status as status',
    [input.userId, input.type, input.period, input.reason],
  );
  return row!;
}

export async function readSettings(client: PoolClient): Promise<{
  settings: UserSettingRowDto[];
  metrics: MetricDefinition[];
  reminders: ReminderRuleDto[];
  app: AppSettingsDto;
}> {
  const settings = await many<UserSettingRowDto>(
    client,
    `select user_id as "userId", metric_key as "metricKey", enabled,
            weekly_target as "weeklyTarget" from user_metric_settings`,
  );
  const metrics = await many<MetricDefinition>(
    client,
    `select ${METRIC_COLUMNS} from metric_definitions md where md.active order by md.sort_order`,
  );
  const reminders = await many<ReminderRuleDto>(
    client,
    `select key, description, to_char(local_time, 'HH24:MI') as "localTime", dow,
            to_admin as "toAdmin", email, in_app as "inApp", active
       from reminder_rules order by local_time, key`,
  );
  const appRows = await many<{ key: string; value: unknown }>(
    client,
    'select key, value from app_settings',
  );

  const raw = Object.fromEntries(appRows.map((r) => [r.key, r.value]));
  return {
    settings,
    metrics,
    reminders,
    app: {
      dailyDueTime: String(raw.daily_due_time ?? '19:00'),
      weeklyOpenTime: String(raw.weekly_open_time ?? '16:00'),
      weeklyDueTime: String(raw.weekly_due_time ?? '12:00'),
      backfillWorkingDays: Number(raw.backfill_working_days ?? 2),
      spikeMultiplier: Number(raw.spike_multiplier ?? 3),
      spikeMinAvg: Number(raw.spike_min_avg ?? 5),
      reportRecipients: Array.isArray(raw.report_recipients)
        ? (raw.report_recipients as string[])
        : [],
    },
  };
}

export async function upsertUserMetricSettings(
  client: PoolClient,
  rows: { userId: string; metricKey: string; enabled?: boolean; weeklyTarget?: number | null }[],
): Promise<void> {
  for (const row of rows) {
    await client.query(
      `insert into user_metric_settings (user_id, metric_key, enabled, weekly_target)
       values ($1, $2, coalesce($3, true), $4)
       on conflict (user_id, metric_key) do update set
         enabled = coalesce($3, user_metric_settings.enabled),
         weekly_target = case when $5 then $4 else user_metric_settings.weekly_target end`,
      [
        row.userId,
        row.metricKey,
        row.enabled ?? null,
        row.weeklyTarget ?? null,
        row.weeklyTarget !== undefined,
      ],
    );
  }
}

export async function putAppSettings(
  client: PoolClient,
  input: Record<string, unknown>,
): Promise<void> {
  const map: Record<string, string> = {
    dailyDueTime: 'daily_due_time',
    weeklyOpenTime: 'weekly_open_time',
    weeklyDueTime: 'weekly_due_time',
    backfillWorkingDays: 'backfill_working_days',
    spikeMultiplier: 'spike_multiplier',
    spikeMinAvg: 'spike_min_avg',
    reportRecipients: 'report_recipients',
  };
  for (const [key, column] of Object.entries(map)) {
    if (input[key] === undefined) continue;
    await client.query(
      `insert into app_settings (key, value) values ($1, $2::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [column, JSON.stringify(input[key])],
    );
  }
}

export async function listCalendarDays(
  client: PoolClient,
  from?: string,
  to?: string,
): Promise<CalendarDayDto[]> {
  return many<CalendarDayDto>(
    client,
    `select c.id, c.day, c.kind, c.label, c.user_id as "userId", p.full_name as "userName"
       from calendar_days c left join profiles p on p.id = c.user_id
      where ($1::date is null or c.day >= $1) and ($2::date is null or c.day <= $2)
      order by c.day desc`,
    [from ?? null, to ?? null],
  );
}
