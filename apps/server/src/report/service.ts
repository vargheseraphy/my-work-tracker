/**
 * The Monday report (RPT-01) and the monthly CSV export (RPT-03).
 * The same builder feeds the report page, the printable view and the emailed summary.
 */

import type { ReportDto, ReportPersonDto } from '@gtm/shared';
import { addDays, daysInMonth, formatWeekRange } from '@gtm/shared';
import { many, one, type PoolClient } from '../db.js';
import { buildWeekPlan, listAccounts } from '../abm/service.js';
import { listProfiles, taskCounts } from '../admin/service.js';
import { readTargets } from '../home/routes.js';

async function weekTotals(client: PoolClient, monday: string): Promise<ReportDto['totals']> {
  const row = await one<ReportDto['totals']>(
    client,
    `with daily as (
       select ev.metric_key, sum(ev.num_value) as total
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.log_type = 'daily' and e.status in ('submitted', 'late')
          and e.period_start between $1::date and $1::date + 6
        group by 1
     ),
     weekly as (
       select ev.metric_key, sum(ev.num_value) as total
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.log_type = 'weekly' and e.status in ('submitted', 'late')
          and e.period_start = $1::date
        group by 1
     )
     select
       coalesce((select total from daily  where metric_key = 'accounts_added'), 0)::int as "accountsAdded",
       coalesce((select total from daily  where metric_key = 'emails'), 0)::int as emails,
       coalesce((select total from daily  where metric_key = 'replies'), 0)::int as replies,
       coalesce((select total from daily  where metric_key = 'posts'), 0)::int as posts,
       coalesce((select total from weekly where metric_key = 'wk_calls'), 0)::int as calls,
       coalesce((select total from weekly where metric_key = 'wk_meetings'), 0)::int as meetings,
       coalesce((select total from weekly where metric_key = 'wk_impressions'), 0)::int as impressions`,
    [monday],
  );
  return (
    row ?? {
      accountsAdded: 0,
      emails: 0,
      replies: 0,
      posts: 0,
      calls: 0,
      meetings: 0,
      impressions: 0,
    }
  );
}

export async function buildReport(client: PoolClient, monday: string): Promise<ReportDto> {
  const profiles = (await listProfiles(client)).filter(
    (p) => p.active && p.role === 'contributor',
  );

  const people: ReportPersonDto[] = [];
  let submitted = 0;
  let late = 0;
  let missing = 0;
  let expected = 0;

  for (const profile of profiles) {
    const counts = await one<{
      submitted: number;
      late: number;
      missing: number;
      expected: number;
    }>(
      client,
      `select
         count(*) filter (where e.status = 'submitted')::int as submitted,
         count(*) filter (where e.status = 'late')::int as late,
         count(*) filter (where e.id is null)::int as missing,
         count(*)::int as expected
       from working_days_between($1, $2::date, $2::date + 4) d
       left join entries e on e.user_id = $1 and e.log_type = 'daily' and e.period_start = d
                          and e.status in ('submitted', 'late')`,
      [profile.id, monday],
    );

    const reflections = await one<{ worked: string; notWorked: string; focus: string }>(
      client,
      `select
         max(case when ev.metric_key = 'wk_reflect_worked' then ev.text_value end) as worked,
         max(case when ev.metric_key = 'wk_reflect_not'    then ev.text_value end) as "notWorked",
         max(case when ev.metric_key = 'wk_reflect_focus'  then ev.text_value end) as focus
       from entries e join entry_values ev on ev.entry_id = e.id
      where e.user_id = $1 and e.log_type = 'weekly' and e.period_start = $2
        and e.status in ('submitted', 'late')`,
      [profile.id, monday],
    );

    submitted += counts?.submitted ?? 0;
    late += counts?.late ?? 0;
    missing += counts?.missing ?? 0;
    expected += counts?.expected ?? 0;

    people.push({
      userId: profile.id,
      fullName: profile.fullName,
      daysSubmitted: (counts?.submitted ?? 0) + (counts?.late ?? 0),
      daysExpected: counts?.expected ?? 0,
      late: counts?.late ?? 0,
      targets: await readTargets(client, profile.id, monday),
      reflections: reflections?.focus || reflections?.worked ? reflections : null,
    });
  }

  // One connection runs one query at a time, so these are sequential on purpose.
  const totals = await weekTotals(client, monday);
  const previousTotals = await weekTotals(client, addDays(monday, -7));
  const accounts = await listAccounts(client);
  const tasks = await taskCounts(client);
  const searchRows = await many<ReportDto['searchActivities'][number]>(
    client,
    `select sa.id, sa.kind, sa.description, sa.link, p.full_name as "userName"
       from search_activities sa
       join entries e on e.id = sa.entry_id
       join profiles p on p.id = e.user_id
      where e.period_start = $1
      order by p.full_name, sa.kind`,
    [monday],
  );

  return {
    monday,
    range: formatWeekRange(monday),
    people,
    totals,
    previousTotals,
    abm: buildWeekPlan(accounts, monday, 6),
    tasks,
    searchActivities: searchRows,
    compliance: { submitted, late, missing, expected },
  };
}

/** RPT-03 · metrics as rows, days as columns, one block per person. */
export async function monthlyCsv(client: PoolClient, month: string): Promise<string> {
  const days = daysInMonth(month);
  const profiles = (await listProfiles(client)).filter(
    (p) => p.active && p.role === 'contributor',
  );

  const metrics = await many<{ key: string; label: string }>(
    client,
    `select key, label from metric_definitions
      where log_type = 'daily' and active order by sort_order`,
  );

  const rows: string[][] = [];
  rows.push(['Person', 'Measure', ...days.map((d) => d.slice(8)), 'Total']);

  for (const profile of profiles) {
    const values = await many<{ day: string; metricKey: string; total: number }>(
      client,
      `select e.period_start as day, ev.metric_key as "metricKey", sum(ev.num_value)::int as total
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.user_id = $1 and e.log_type = 'daily' and e.status in ('submitted', 'late')
          and e.period_start between $2::date and $3::date
        group by 1, 2`,
      [profile.id, days[0], days.at(-1)],
    );

    for (const metric of metrics) {
      const byDay = days.map((d) => {
        const found = values.find((v) => v.day === d && v.metricKey === metric.key);
        return found ? String(found.total) : '';
      });
      const total = byDay.reduce((sum, v) => sum + (v === '' ? 0 : Number(v)), 0);
      rows.push([profile.fullName, metric.label, ...byDay, String(total)]);
    }
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function csvCell(value: string): string {
  // Stop a spreadsheet treating a leading =, +, - or @ as a formula.
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
