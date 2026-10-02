import type { AbmAccountDto, AbmTouchesDto, AbmWeekPlanDto } from '@gtm/shared';
import { ABM_LIVE_STAGES, addDays, weekMonday } from '@gtm/shared';
import { many, one, type PoolClient } from '../db.js';
import { notFound } from '../errors.js';

const ACCOUNT_COLUMNS = `
  a.id, a.name, a.vertical, a.region, a.owner_id as "ownerId", p.full_name as "ownerName",
  a.planned_week as "plannedWeek", a.stage, a.notes,
  a.research_url as "researchUrl", a.deck_url as "deckUrl", a.landing_url as "landingUrl",
  a.live_at as "liveAt",
  (a.stage in ('Live', 'Engaged', 'Meeting booked', 'Closed')) as "isLive"`;

interface RawAccount extends Omit<AbmAccountDto, 'liveAt'> {
  liveAt: Date | null;
}

function toAccount(row: RawAccount): AbmAccountDto {
  return { ...row, liveAt: row.liveAt ? row.liveAt.toISOString() : null };
}

export async function listAccounts(client: PoolClient): Promise<AbmAccountDto[]> {
  const rows = await many<RawAccount>(
    client,
    `select ${ACCOUNT_COLUMNS} from abm_accounts a join profiles p on p.id = a.owner_id
      order by a.planned_week desc, a.name`,
  );
  return rows.map(toAccount);
}

export async function readAccount(client: PoolClient, id: string): Promise<AbmAccountDto> {
  const row = await one<RawAccount>(
    client,
    `select ${ACCOUNT_COLUMNS} from abm_accounts a join profiles p on p.id = a.owner_id where a.id = $1`,
    [id],
  );
  if (!row) throw notFound();
  return toAccount(row);
}

export async function readOwnedAbmAccounts(
  client: PoolClient,
  userId: string,
): Promise<AbmAccountDto[]> {
  const rows = await many<RawAccount>(
    client,
    `select ${ACCOUNT_COLUMNS} from abm_accounts a join profiles p on p.id = a.owner_id
      where a.owner_id = $1 order by a.planned_week desc`,
    [userId],
  );
  return rows.map(toAccount);
}

export async function listTouches(client: PoolClient): Promise<AbmTouchesDto[]> {
  return many<AbmTouchesDto>(
    client,
    `select account_id as "accountId", week_start as "weekStart", emails, messages, calls
       from abm_weekly_touches order by week_start desc`,
  );
}

/**
 * The one-account-a-week strip (ABM-03). Twelve weeks ending with the current one; a past week
 * with no account, or with an account that never went live, shows as missed.
 */
export function buildWeekPlan(
  accounts: AbmAccountDto[],
  currentWeek: string,
  weeks = 12,
): AbmWeekPlanDto[] {
  const out: AbmWeekPlanDto[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const week = addDays(currentWeek, -7 * i);
    const account = accounts.find((a) => a.plannedWeek === week) ?? null;
    const isPast = week < currentWeek;
    const live = account ? ABM_LIVE_STAGES.includes(account.stage) : false;
    out.push({ week, account, missed: isPast && !live });
  }
  return out;
}

export async function currentWeek(client: PoolClient, userId: string): Promise<string> {
  const row = await one<{ today: string }>(client, 'select local_today($1) as today', [userId]);
  return weekMonday(row!.today);
}

export async function createAccount(
  client: PoolClient,
  input: {
    name: string;
    vertical: string;
    region: string;
    ownerId: string;
    plannedWeek: string;
    stage: string;
    notes: string | null;
  },
  createdBy: string,
): Promise<AbmAccountDto> {
  const row = await one<{ id: string }>(
    client,
    `insert into abm_accounts (name, vertical, region, owner_id, planned_week, stage, notes, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      input.name,
      input.vertical,
      input.region,
      input.ownerId,
      input.plannedWeek,
      input.stage,
      input.notes,
      createdBy,
    ],
  );
  return readAccount(client, row!.id);
}

/**
 * Update an account. The database trigger guard_abm_owner_update() refuses a non-admin who tries
 * to change the name, vertical, region, owner or launch week, so nothing is checked here.
 */
export async function patchAccount(
  client: PoolClient,
  id: string,
  input: Record<string, unknown>,
): Promise<AbmAccountDto> {
  const columns: Record<string, string> = {
    name: 'name',
    vertical: 'vertical',
    region: 'region',
    ownerId: 'owner_id',
    plannedWeek: 'planned_week',
    stage: 'stage',
    notes: 'notes',
    researchUrl: 'research_url',
    deckUrl: 'deck_url',
    landingUrl: 'landing_url',
  };

  const sets: string[] = [];
  const values: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] !== undefined) {
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return readAccount(client, id);

  const result = await client.query(
    `update abm_accounts set ${sets.join(', ')} where id = $1`,
    values,
  );
  if (result.rowCount === 0) throw notFound();
  return readAccount(client, id);
}

export async function putTouches(
  client: PoolClient,
  accountId: string,
  weekStart: string,
  touches: { emails: number; messages: number; calls: number },
  userId: string,
): Promise<AbmTouchesDto> {
  const row = await one<AbmTouchesDto>(
    client,
    `insert into abm_weekly_touches (account_id, week_start, emails, messages, calls, updated_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (account_id, week_start) do update
       set emails = excluded.emails, messages = excluded.messages, calls = excluded.calls,
           updated_by = excluded.updated_by, updated_at = now()
     returning account_id as "accountId", week_start as "weekStart", emails, messages, calls`,
    [accountId, weekStart, touches.emails, touches.messages, touches.calls, userId],
  );
  return row!;
}
