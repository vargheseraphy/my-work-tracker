/**
 * Entry reads and writes. Every rule with business meaning stays in the database functions
 * (open_entry, submit_entry); this module only moves data (CLAUDE.md "How the database is used").
 */

import type { AttachmentDto, EntryDto, EntryValueDto, SearchActivityDto } from '@gtm/shared';
import type { MetricDefinition } from '@gtm/shared';
import { many, one, type PoolClient } from '../db.js';
import { notFound } from '../errors.js';

export const METRIC_COLUMNS = `
  key, label, log_type as "logType", group_name as "groupName",
  value_type as "valueType", proof, auto_from as "autoFrom",
  is_target_measure as "isTargetMeasure", sort_order as "sortOrder",
  per_brand as "perBrand"`;

interface EntryRow {
  id: string;
  userId: string;
  logType: 'daily' | 'weekly';
  periodStart: string;
  status: 'draft' | 'submitted' | 'late' | 'unlocked';
  isLate: boolean;
  submittedAt: Date | null;
  unlockReason: string | null;
  noSearchActivity: boolean;
  autoTotals: Record<string, number> | null;
}

const ENTRY_COLUMNS = `
  id, user_id as "userId", log_type as "logType", period_start as "periodStart",
  status, is_late as "isLate", submitted_at as "submittedAt",
  unlock_reason as "unlockReason", no_search_activity as "noSearchActivity",
  auto_totals as "autoTotals"`;

export async function openEntry(
  client: PoolClient,
  type: 'daily' | 'weekly',
  period: string,
): Promise<string> {
  const row = await one<{ id: string }>(client, 'select (open_entry($1, $2)).id as id', [
    type,
    period,
  ]);
  return row!.id;
}

export async function readEntry(client: PoolClient, entryId: string): Promise<EntryDto> {
  const row = await one<EntryRow>(
    client,
    `select ${ENTRY_COLUMNS} from entries where id = $1`,
    [entryId],
  );
  if (!row) throw notFound();

  // One connection runs one query at a time, so these are sequential on purpose.
  const values = await readValues(client, entryId);
  const attachments = await readAttachments(client, { entryId });
  const searchActivities = await readSearchActivities(client, entryId);
  const abmAccountIds = await readAbmPicks(client, entryId);

  return {
    ...row,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    values,
    attachments,
    searchActivities,
    abmAccountIds,
  };
}

export async function findEntry(
  client: PoolClient,
  userId: string,
  type: 'daily' | 'weekly',
  period: string,
): Promise<EntryRow | undefined> {
  return one<EntryRow>(
    client,
    `select ${ENTRY_COLUMNS} from entries
      where user_id = $1 and log_type = $2 and period_start = $3`,
    [userId, type, period],
  );
}

export async function readValues(client: PoolClient, entryId: string): Promise<EntryValueDto[]> {
  const rows = await many<{
    metricKey: string;
    brandId: string | null;
    numValue: number | null;
    textValue: string | null;
    note: string | null;
    updatedAt: Date;
  }>(
    client,
    `select metric_key as "metricKey", brand_id as "brandId", num_value as "numValue",
            text_value as "textValue", note, updated_at as "updatedAt"
       from entry_values where entry_id = $1`,
    [entryId],
  );
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function readAttachments(
  client: PoolClient,
  where: { entryId?: string; taskId?: string },
): Promise<AttachmentDto[]> {
  const column = where.entryId ? 'entry_id' : 'task_id';
  const value = where.entryId ?? where.taskId;
  const rows = await many<{
    id: string;
    metricKey: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }>(
    client,
    `select id, metric_key as "metricKey", file_name as "fileName", mime_type as "mimeType",
            size_bytes as "sizeBytes", created_at as "createdAt"
       from attachments where ${column} = $1 order by created_at`,
    [value],
  );
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    url: `/api/files/${r.id}`,
  }));
}

export async function readSearchActivities(
  client: PoolClient,
  entryId: string,
): Promise<SearchActivityDto[]> {
  return many<SearchActivityDto>(
    client,
    `select id, kind, description, link from search_activities
      where entry_id = $1 order by created_at`,
    [entryId],
  );
}

export async function readAbmPicks(client: PoolClient, entryId: string): Promise<string[]> {
  const rows = await many<{ account_id: string }>(
    client,
    'select account_id from entry_abm_accounts where entry_id = $1',
    [entryId],
  );
  return rows.map((r) => r.account_id);
}

/** Enabled, active fields for this person and log type, in sort order. */
export async function readFields(
  client: PoolClient,
  userId: string,
  logType: 'daily' | 'weekly',
  options: { includeAuto?: boolean } = {},
): Promise<MetricDefinition[]> {
  return many<MetricDefinition>(
    client,
    `select ${METRIC_COLUMNS}
       from metric_definitions md
       left join user_metric_settings s on s.metric_key = md.key and s.user_id = $1
      where md.log_type = $2 and md.active and coalesce(s.enabled, true)
        ${options.includeAuto ? '' : 'and md.auto_from is null'}
      order by md.sort_order`,
    [userId, logType],
  );
}

export async function upsertValue(
  client: PoolClient,
  entryId: string,
  metricKey: string,
  value: {
    numValue?: number | null;
    textValue?: string | null;
    note?: string | null;
    /** Null for a measure that is not split by brand (db/migrations/0013). */
    brandId?: string | null;
  },
): Promise<EntryValueDto> {
  const row = await one<{
    metricKey: string;
    brandId: string | null;
    numValue: number | null;
    textValue: string | null;
    note: string | null;
    updatedAt: Date;
  }>(
    client,
    // Named constraint, not a column list: the key treats nulls as equal (nulls not distinct),
    // which a plain inference list cannot express.
    `insert into entry_values (entry_id, metric_key, num_value, text_value, note, brand_id)
     values ($1, $2, $3, $4, $5, $9)
     on conflict on constraint entry_values_key do update set
       num_value  = case when $6 then excluded.num_value  else entry_values.num_value  end,
       text_value = case when $7 then excluded.text_value else entry_values.text_value end,
       note       = case when $8 then excluded.note       else entry_values.note       end,
       updated_at = now()
     returning metric_key as "metricKey", num_value as "numValue", text_value as "textValue",
               note, brand_id as "brandId", updated_at as "updatedAt"`,
    [
      entryId,
      metricKey,
      value.numValue ?? null,
      value.textValue ?? null,
      value.note ?? null,
      value.numValue !== undefined,
      value.textValue !== undefined,
      value.note !== undefined,
      value.brandId ?? null,
    ],
  );
  return { ...row!, updatedAt: row!.updatedAt.toISOString() };
}

export async function setNoSearchActivity(
  client: PoolClient,
  entryId: string,
  value: boolean,
): Promise<void> {
  const result = await client.query(
    'update entries set no_search_activity = $2 where id = $1',
    [entryId, value],
  );
  if (result.rowCount === 0) throw notFound();
}

export async function submitEntry(
  client: PoolClient,
  entryId: string,
): Promise<{ ok: boolean; status?: string; errors?: string[] }> {
  const row = await one<{ result: { ok: boolean; status?: string; errors?: string[] } }>(
    client,
    'select submit_entry($1) as result',
    [entryId],
  );
  return row!.result;
}

/** Working days with no submitted entry, oldest first. */
export async function missingDays(
  client: PoolClient,
  userId: string,
  lookback = 31,
): Promise<string[]> {
  const rows = await many<{ d: string }>(
    client,
    'select d from missing_days($1, $2) d order by d',
    [userId, lookback],
  );
  return rows.map((r) => r.d);
}

/** Of those, the ones still inside the self-service backfill window. */
export async function backfillDays(client: PoolClient, userId: string): Promise<string[]> {
  const rows = await many<{ d: string }>(
    client,
    'select d from missing_days($1) d where within_backfill($1, d) order by d',
    [userId],
  );
  return rows.map((r) => r.d);
}

export async function withinBackfill(
  client: PoolClient,
  userId: string,
  day: string,
): Promise<boolean> {
  const row = await one<{ ok: boolean }>(client, 'select within_backfill($1, $2) as ok', [
    userId,
    day,
  ]);
  return row?.ok ?? false;
}

export async function localToday(client: PoolClient, userId: string): Promise<string> {
  const row = await one<{ today: string }>(client, 'select local_today($1) as today', [userId]);
  return row!.today;
}

/** The four-week average per daily metric, for the spike rule (check 7). */
export async function fourWeekAverage(
  client: PoolClient,
  userId: string,
  day: string,
): Promise<Record<string, number>> {
  const rows = await many<{ metricKey: string; average: number }>(
    client,
    `select ev.metric_key as "metricKey", avg(ev.num_value)::numeric as average
       from entry_values ev
       join entries e on e.id = ev.entry_id
      where e.user_id = $1 and e.log_type = 'daily'
        and e.status in ('submitted', 'late')
        and e.period_start between $2::date - 28 and $2::date - 1
      group by ev.metric_key`,
    [userId, day],
  );
  return Object.fromEntries(rows.map((r) => [r.metricKey, Number(r.average)]));
}

export async function weekAutoTotals(
  client: PoolClient,
  userId: string,
  monday: string,
): Promise<Record<string, number>> {
  const rows = await many<{ metric_key: string; total: number }>(
    client,
    'select metric_key, total from week_auto_totals($1, $2)',
    [userId, monday],
  );
  return Object.fromEntries(rows.map((r) => [r.metric_key, Number(r.total)]));
}

export async function appSettings(client: PoolClient): Promise<Record<string, unknown>> {
  const rows = await many<{ key: string; value: unknown }>(
    client,
    'select key, value from app_settings',
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Award "every target hit this week" if it has just become true (db/migrations/0010).
 * Returns true only on the run that awarded it, so the caller can celebrate exactly once.
 */
export async function awardWeekTarget(client: PoolClient, userId: string): Promise<boolean> {
  const row = await one<{ awarded: boolean }>(
    client,
    'select award_week_target($1) as awarded',
    [userId],
  );
  return row?.awarded ?? false;
}

/**
 * Celebrate meetings booked on a submitted weekly log (db/migrations/0011).
 * Once per week; true only on the run that awarded it.
 */
export async function awardMeetings(client: PoolClient, entryId: string): Promise<boolean> {
  const row = await one<{ awarded: boolean }>(
    client,
    'select award_meetings($1) as awarded',
    [entryId],
  );
  return row?.awarded ?? false;
}


/** The brands this person is assigned, in display order (db/migrations/0013). */
export async function readUserBrands(
  client: PoolClient,
  userId: string,
): Promise<{ id: string; name: string }[]> {
  return many<{ id: string; name: string }>(
    client,
    `select b.id, b.name
       from user_brands ub
       join brands b on b.id = ub.brand_id
      where ub.user_id = $1 and b.active
      order by b.sort_order, b.name`,
    [userId],
  );
}
