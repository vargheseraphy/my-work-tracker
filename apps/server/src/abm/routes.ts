import type { FastifyInstance } from 'fastify';
import { schemas, type AbmScreenDto } from '@gtm/shared';
import { z } from 'zod';
import { withUser } from '../db.js';
import { requireAdmin, requireContributor, requireUser } from '../context.js';
import {
  buildWeekPlan,
  createAccount,
  currentWeek,
  listAccounts,
  listTouches,
  patchAccount,
  putTouches,
} from './service.js';

const idParam = z.object({ id: schemas.uuid });
const touchesParam = z.object({ id: schemas.uuid, monday: schemas.monday });

export async function abmRoutes(app: FastifyInstance): Promise<void> {
  /** The whole ABM screen: accounts, the one-a-week strip and this year's touches (ABM-03). */
  app.get('/abm', async (request) => {
    const user = requireUser(request);
    return withUser(user.id, async (client): Promise<AbmScreenDto> => {
      // One connection runs one query at a time, so these are sequential on purpose.
      const accounts = await listAccounts(client);
      const touches = await listTouches(client);
      const week = await currentWeek(client, user.id);
      return { accounts, touches, currentWeek: week, weekPlan: buildWeekPlan(accounts, week) };
    });
  });

  /** Admin adds an account (ABM-01). */
  app.post('/abm', async (request, reply) => {
    const user = requireAdmin(request);
    const body = schemas.createAbmBody.parse(request.body);
    const account = await withUser(user.id, async (client) =>
      createAccount(
        client,
        {
          name: body.name,
          vertical: body.vertical,
          region: body.region,
          ownerId: body.ownerId,
          plannedWeek: body.plannedWeek,
          stage: body.stage,
          notes: body.notes ?? null,
        },
        user.id,
      ),
    );
    return reply.status(201).send({ account });
  });

  /** Owner or admin moves the stage, notes and links (ABM-02). */
  app.patch('/abm/:id', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.patchAbmBody.parse(request.body);
    return withUser(user.id, async (client) => ({ account: await patchAccount(client, id, body) }));
  });

  /** Weekly touches per account (ABM-04). */
  app.put('/abm/:id/touches/:monday', async (request) => {
    const user = requireContributor(request);
    const { id, monday } = touchesParam.parse(request.params);
    const body = schemas.putTouchesBody.parse(request.body);
    return withUser(user.id, async (client) => ({
      touches: await putTouches(client, id, monday, body, user.id),
    }));
  });
}
