import type { FastifyInstance } from 'fastify';
import { schemas } from '@gtm/shared';
import { z } from 'zod';
import { withUser } from '../db.js';
import { requireAdmin, requireContributor, requireUser } from '../context.js';
import { createTask, listTasks, patchTask, readTask, updateTaskStatus } from './service.js';

const idParam = z.object({ id: schemas.uuid });

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  /** A contributor sees their own tasks; admin and viewer see everyone's. */
  app.get('/tasks', async (request) => {
    const user = requireUser(request);
    const query = schemas.listTasksQuery.parse(request.query ?? {});

    const assigneeId =
      user.role === 'contributor'
        ? user.id
        : query.owner === 'me'
          ? user.id
          : query.owner === 'all' || query.owner === undefined
            ? undefined
            : query.owner;

    return withUser(user.id, async (client) => ({
      tasks: await listTasks(client, {
        status: query.status,
        assigneeId,
        openOnly: query.overdue === 'true' ? true : undefined,
      }),
    }));
  });

  app.get('/tasks/:id', async (request) => {
    const user = requireUser(request);
    const { id } = idParam.parse(request.params);
    return withUser(user.id, async (client) => ({ task: await readTask(client, id) }));
  });

  /** Status change (TSK-02). Rules live in update_task(); errors come back as 409 rule messages. */
  app.post('/tasks/:id/status', async (request) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.taskStatusBody.parse(request.body);

    return withUser(user.id, async (client) => ({
      task: await updateTaskStatus(
        client,
        id,
        body.status,
        body.note ?? null,
        body.proofUrl ?? null,
      ),
    }));
  });

  /** Admin creates a task; the assignee is notified by a trigger (TSK-01). */
  app.post('/tasks', async (request, reply) => {
    const user = requireAdmin(request);
    const body = schemas.createTaskBody.parse(request.body);

    const task = await withUser(user.id, async (client) =>
      createTask(
        client,
        {
          title: body.title,
          description: body.description ?? null,
          assigneeId: body.assigneeId,
          dueDate: body.dueDate,
          priority: body.priority,
        },
        user.id,
      ),
    );
    return reply.status(201).send({ task });
  });

  /** Admin reassigns, changes the due date or cancels (TSK-04). */
  app.patch('/tasks/:id', async (request) => {
    const user = requireAdmin(request);
    const { id } = idParam.parse(request.params);
    const body = schemas.patchTaskBody.parse(request.body);

    return withUser(user.id, async (client) => ({ task: await patchTask(client, id, body) }));
  });
}
