import type { FastifyInstance } from 'fastify';
import { schemas } from '@gtm/shared';
import { z } from 'zod';
import { one, withUser } from '../db.js';
import { requireAdmin, requireAdminOrViewer } from '../context.js';
import { notFound } from '../errors.js';
import { createUser, issueToken } from '../auth/service.js';
import { destroyAllSessions } from '../auth/sessions.js';
import { sendMail } from '../mail/transport.js';
import { invitePasswordEmail } from '../mail/templates.js';
import {
  compliance,
  dashboard,
  listCalendarDays,
  listProfiles,
  personDetail,
  putAppSettings,
  readSettings,
  unlockEntry,
  upsertUserMetricSettings,
} from './service.js';

const idParam = z.object({ id: schemas.uuid });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /** Every signed-in person needs the team list, for assignee pickers and names. */
  app.get('/people', async (request) => {
    const user = requireAdminOrViewer(request);
    return withUser(user.id, async (client) => ({ people: await listProfiles(client) }));
  });

  app.get('/admin/compliance', async (request) => {
    const user = requireAdminOrViewer(request);
    const { month } = schemas.complianceQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => compliance(client, month));
  });

  app.get('/admin/week', async (request) => {
    const user = requireAdminOrViewer(request);
    const { monday } = schemas.weekQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => dashboard(client, monday, user.id));
  });

  app.get('/admin/people/:id', async (request) => {
    const user = requireAdminOrViewer(request);
    const { id } = idParam.parse(request.params);
    const { days } = schemas.personQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => personDetail(client, id, days));
  });

  /** DSH-06 · unlock a locked or missed day, with a reason. */
  app.post('/admin/unlock', async (request) => {
    const user = requireAdmin(request);
    const body = schemas.unlockBody.parse(request.body);
    return withUser(user.id, async (client) => ({ entry: await unlockEntry(client, body) }));
  });

  // ---------- settings ----------

  app.get('/admin/settings', async (request) => {
    const user = requireAdminOrViewer(request);
    return withUser(user.id, async (client) => ({
      people: await listProfiles(client),
      ...(await readSettings(client)),
    }));
  });

  /** ADM-01 · weekly targets per person. */
  app.put('/admin/settings/targets', async (request) => {
    const user = requireAdmin(request);
    const body = schemas.putTargetsBody.parse(request.body);
    return withUser(user.id, async (client) => {
      await upsertUserMetricSettings(client, body.targets);
      return { ok: true };
    });
  });

  /** ADM-02 · which fields each person logs. */
  app.put('/admin/settings/fields', async (request) => {
    const user = requireAdmin(request);
    const body = schemas.putFieldsBody.parse(request.body);
    return withUser(user.id, async (client) => {
      await upsertUserMetricSettings(client, body.fields);
      return { ok: true };
    });
  });

  /** ADM-03 · reminder times. */
  app.put('/admin/settings/reminders', async (request) => {
    const user = requireAdmin(request);
    const body = schemas.putRemindersBody.parse(request.body);
    return withUser(user.id, async (client) => {
      for (const rule of body.rules) {
        await client.query(
          `update reminder_rules
              set local_time = $2::time, email = $3, in_app = $4, active = $5
            where key = $1`,
          [rule.key, rule.localTime, rule.email, rule.inApp, rule.active],
        );
      }
      return { ok: true };
    });
  });

  app.put('/admin/settings/app', async (request) => {
    const user = requireAdmin(request);
    const body = schemas.putAppSettingsBody.parse(request.body);
    return withUser(user.id, async (client) => {
      await putAppSettings(client, body);
      return { ok: true };
    });
  });

  // ---------- holidays and leave (ADM-04) ----------

  app.get('/admin/calendar', async (request) => {
    const user = requireAdminOrViewer(request);
    const query = schemas.calendarQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => ({
      days: await listCalendarDays(client, query.from, query.to),
    }));
  });

  app.post('/admin/calendar', async (request, reply) => {
    const user = requireAdmin(request);
    const body = schemas.createCalendarDayBody.parse(request.body);
    const day = await withUser(user.id, async (client) =>
      one(
        client,
        `insert into calendar_days (day, user_id, kind, label, created_by)
         values ($1, $2, $3, $4, $5)
         returning id, day, kind, label, user_id as "userId"`,
        [body.day, body.userId ?? null, body.kind, body.label, user.id],
      ),
    );
    return reply.status(201).send({ day });
  });

  app.delete('/admin/calendar/:id', async (request, reply) => {
    const user = requireAdmin(request);
    const { id } = idParam.parse(request.params);
    await withUser(user.id, async (client) => {
      const result = await client.query('delete from calendar_days where id = $1', [id]);
      if (result.rowCount === 0) throw notFound();
    });
    return reply.status(204).send();
  });

  // ---------- users (ADM-05) ----------

  app.get('/admin/users', async (request) => {
    const user = requireAdminOrViewer(request);
    return withUser(user.id, async (client) => ({ users: await listProfiles(client) }));
  });

  app.post('/admin/users/invite', async (request, reply) => {
    requireAdmin(request);
    const body = schemas.inviteUserBody.parse(request.body);

    const created = await createUser({
      email: body.email,
      fullName: body.fullName,
      role: body.role,
      timezone: body.timezone,
      workDays: body.workDays,
      startDate: body.startDate,
    });

    const invite = await issueToken(created.id, 'invite');
    await sendMail(invitePasswordEmail(body.email, body.fullName, invite.link)).catch(
      (error: Error) => request.log.error({ err: error.message }, 'invite email failed'),
    );

    return reply.status(201).send({ id: created.id, email: body.email });
  });

  /** AUTH-04 · deactivating someone ends every session they have. */
  app.patch('/admin/users/:id', async (request) => {
    const user = requireAdmin(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.patchUserBody.parse(request.body);

    const updated = await withUser(user.id, async (client) => {
      const columns: Record<string, string> = {
        fullName: 'full_name',
        role: 'role',
        timezone: 'timezone',
        workDays: 'work_days',
        startDate: 'start_date',
        active: 'active',
      };
      const sets: string[] = [];
      const values: unknown[] = [id];
      for (const [key, column] of Object.entries(columns)) {
        const value = (body as Record<string, unknown>)[key];
        if (value !== undefined) {
          values.push(value);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (sets.length === 0) throw notFound();

      const row = await one(
        client,
        `update profiles set ${sets.join(', ')} where id = $1
         returning id, email, full_name as "fullName", role, timezone,
                   work_days as "workDays", start_date as "startDate", active`,
        values,
      );
      if (!row) throw notFound();
      return row;
    });

    if (body.active === false) await destroyAllSessions(id);
    return { user: updated };
  });
}
