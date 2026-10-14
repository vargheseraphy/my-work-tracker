import type { FastifyInstance } from 'fastify';
import { schemas, weekMonday, type EntryScreenDto } from '@gtm/shared';
import { z } from 'zod';
import { many, one, withUser } from '../db.js';
import { requireContributor, requireUser } from '../context.js';
import { notFound } from '../errors.js';
import { readOwnedAbmAccounts } from '../abm/service.js';
import { readDueTasks } from '../tasks/service.js';
import {
  appSettings,
  backfillDays,
  findEntry,
  fourWeekAverage,
  localToday,
  missingDays,
  openEntry,
  readEntry,
  readFields,
  setNoSearchActivity,
  awardMeetings,
  awardWeekTarget,
  submitEntry,
  upsertValue,
  weekAutoTotals,
  withinBackfill,
} from './service.js';

const idParam = z.object({ id: schemas.uuid });
const valueParam = z.object({ id: schemas.uuid, metricKey: schemas.metricKey });

function timeSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const value = settings[key];
  return typeof value === 'string' ? value : fallback;
}

function numberSetting(settings: Record<string, unknown>, key: string, fallback: number): number {
  const value = settings[key];
  return typeof value === 'number' ? value : fallback;
}

export async function entriesRoutes(app: FastifyInstance): Promise<void> {
  /** Open or return today's (or a chosen day's) entry, with everything the screen needs. */
  app.post('/entries/open', async (request) => {
    const user = requireContributor(request);
    const body = schemas.openEntryBody.parse(request.body);

    return withUser(user.id, async (client) => {
      const entryId = await openEntry(client, body.type, body.period);
      return buildScreen(client, user.id, entryId, body.type, body.period);
    });
  });

  /** Read one entry. A contributor sees their own; admin and viewer see anyone's. */
  app.get('/entries/:id', async (request) => {
    const user = requireUser(request);
    const { id } = idParam.parse(request.params);
    return withUser(user.id, async (client) => {
      const entry = await readEntry(client, id);
      const fields = await readFields(client, entry.userId, entry.logType, { includeAuto: true });
      return { entry, fields };
    });
  });

  /** The whole screen for a day or week, opening the entry if it does not exist yet. */
  app.get('/entries/screen/:type/:period', async (request) => {
    const user = requireContributor(request);
    const params = z
      .object({ type: z.enum(['daily', 'weekly']), period: schemas.isoDate })
      .parse(request.params);

    return withUser(user.id, async (client) => {
      const existing = await findEntry(client, user.id, params.type, params.period);
      const entryId = existing ? existing.id : await openEntry(client, params.type, params.period);
      return buildScreen(client, user.id, entryId, params.type, params.period);
    });
  });

  /** Autosave one field (DAY-02). */
  app.put('/entries/:id/values/:metricKey', async (request) => {
    const user = requireContributor(request);
    const { id, metricKey } = valueParam.parse(request.params);
    const body = schemas.putValueBody.parse(request.body);

    return withUser(user.id, async (client) => {
      const owns = await one<{ id: string }>(
        client,
        'select id from entries where id = $1 and user_id = $2',
        [id, user.id],
      );
      if (!owns) throw notFound();
      return { value: await upsertValue(client, id, metricKey, body) };
    });
  });

  /** "No search activity this week" (WK-05). */
  app.patch('/entries/:id', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.patchEntryBody.parse(request.body);

    return withUser(user.id, async (client) => {
      await setNoSearchActivity(client, id, body.noSearchActivity);
      return { ok: true };
    });
  });

  /** Sign off. Every rule runs in submit_entry; its answer is passed through unchanged. */
  app.post('/entries/:id/submit', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    return withUser(user.id, async (client) => {
      const result = await submitEntry(client, id);
      // A sign-off can be the thing that completes the week. Awarding here, inside the same
      // transaction, means the congratulations and the manager's notification either both
      // happen or neither does (db/migrations/0010).
      if (result.ok) {
        await awardWeekTarget(client, user.id);
        // A weekly log is where meetings are recorded, so the meeting moment belongs here.
        await awardMeetings(client, id);
      }
      return result;
    });
  });

  /** Own history. */
  app.get('/entries', async (request) => {
    const user = requireUser(request);
    const query = schemas.listEntriesQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => {
      const entries = await many(
        client,
        `select id, log_type as "logType", period_start as "periodStart", status,
                is_late as "isLate", submitted_at as "submittedAt"
           from entries
          where user_id = $1
            and ($2::log_type is null or log_type = $2)
            and ($3::date is null or period_start >= $3)
            and ($4::date is null or period_start <= $4)
          order by period_start desc`,
        [user.id, query.type ?? null, query.from ?? null, query.to ?? null],
      );
      return { entries };
    });
  });

  /** Read-only weekly totals summed from the daily logs (WK-02). */
  app.get('/weekly/:monday/auto-totals', async (request) => {
    const user = requireContributor(request);
    const { monday } = z.object({ monday: schemas.monday }).parse(request.params);
    return withUser(user.id, async (client) => ({
      totals: await weekAutoTotals(client, user.id, monday),
    }));
  });

  /** Search activity rows on a weekly log (WK-05). */
  app.post('/entries/:id/search-activities', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.searchActivityBody.parse(request.body);

    return withUser(user.id, async (client) => {
      const row = await one(
        client,
        `insert into search_activities (entry_id, kind, description, link)
         values ($1, $2, $3, $4) returning id, kind, description, link`,
        [id, body.kind, body.description, body.link ?? null],
      );
      return { activity: row };
    });
  });

  app.put('/search-activities/:id', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.searchActivityBody.parse(request.body);

    return withUser(user.id, async (client) => {
      const row = await one(
        client,
        `update search_activities set kind = $2, description = $3, link = $4
          where id = $1 returning id, kind, description, link`,
        [id, body.kind, body.description, body.link ?? null],
      );
      if (!row) throw notFound();
      return { activity: row };
    });
  });

  app.delete('/search-activities/:id', async (request, reply) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    await withUser(user.id, async (client) => {
      const result = await client.query('delete from search_activities where id = $1', [id]);
      if (result.rowCount === 0) throw notFound();
    });
    return reply.status(204).send();
  });

  /** Replace the set of ABM accounts worked this week (WK-06). */
  app.put('/entries/:id/abm-accounts', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.putAbmAccountsBody.parse(request.body);

    return withUser(user.id, async (client) => {
      await client.query('delete from entry_abm_accounts where entry_id = $1', [id]);
      for (const accountId of body.accountIds) {
        await client.query(
          'insert into entry_abm_accounts (entry_id, account_id) values ($1, $2)',
          [id, accountId],
        );
      }
      return { accountIds: body.accountIds };
    });
  });
}

/** Everything the daily or weekly log screen needs, in one response. */
async function buildScreen(
  client: Parameters<typeof readEntry>[0],
  userId: string,
  entryId: string,
  type: 'daily' | 'weekly',
  period: string,
): Promise<EntryScreenDto> {
  // One connection runs one query at a time, so these are sequential on purpose.
  const entry = await readEntry(client, entryId);
  const fields = await readFields(client, userId, type);
  const today = await localToday(client, userId);
  const settings = await appSettings(client);

  const missing = await missingDays(client, userId);
  const backfill = await backfillDays(client, userId);
  const inWindow = await withinBackfill(client, userId, period);

  const base: EntryScreenDto = {
    entry,
    fields,
    today,
    withinBackfill: inWindow,
    missingDays: missing,
    backfillDays: backfill,
    dueTasks: type === 'daily' ? await readDueTasks(client, userId, period) : [],
    fourWeekAverage: type === 'daily' ? await fourWeekAverage(client, userId, period) : {},
    spikeMultiplier: numberSetting(settings, 'spike_multiplier', 3),
    spikeMinAvg: numberSetting(settings, 'spike_min_avg', 5),
    dailyDueTime: timeSetting(settings, 'daily_due_time', '19:00'),
  };

  if (type === 'weekly') {
    const monday = weekMonday(period);
    const autoTotals = await weekAutoTotals(client, userId, monday);
    const owned = await readOwnedAbmAccounts(client, userId);
    const openCheck = await one<{ isOpen: boolean }>(
      client,
      `select local_now($1) >= ($2::date + 4 + coalesce((setting('weekly_open_time') #>> '{}')::time, '16:00')) as "isOpen"`,
      [userId, monday],
    );
    const previous = await one<{ followers: number | null }>(
      client,
      `select ev.num_value as followers
         from entries e join entry_values ev on ev.entry_id = e.id
        where e.user_id = $1 and e.log_type = 'weekly' and e.period_start = $2::date - 7
          and ev.metric_key = 'wk_followers'`,
      [userId, monday],
    );

    base.autoTotals = autoTotals;
    base.weeklyIsOpen = openCheck?.isOpen ?? false;
    base.ownedAbmAccounts = owned;
    base.ownsActiveAbmAccount = owned.some((a) =>
      ['Live', 'Engaged', 'Meeting booked'].includes(a.stage),
    );
    base.previousFollowers = previous?.followers ?? null;
    base.missingDays = missing.filter((d) => d >= monday && d <= addFour(monday));
  }

  return base;
}

function addFour(monday: string): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
}
