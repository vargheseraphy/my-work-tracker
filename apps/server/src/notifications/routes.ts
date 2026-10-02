import type { FastifyInstance } from 'fastify';
import { schemas, type NotificationDto, type NotificationsDto } from '@gtm/shared';
import { z } from 'zod';
import { many, one, withUser } from '../db.js';
import { requireUser } from '../context.js';
import { notFound } from '../errors.js';

const idParam = z.object({ id: schemas.uuid });

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  /** The bell: the latest 50 and the unread count (NTF-03). */
  app.get('/notifications', async (request) => {
    const user = requireUser(request);
    return withUser(user.id, async (client): Promise<NotificationsDto> => {
      const items = await many<Omit<NotificationDto, 'readAt' | 'createdAt'> & {
        readAt: Date | null;
        createdAt: Date;
      }>(
        client,
        `select id, rule_key as "ruleKey", title, body, link, local_date as "localDate",
                read_at as "readAt", created_at as "createdAt"
           from notifications order by created_at desc limit 50`,
      );
      const count = await one<{ unread: number }>(
        client,
        'select count(*)::int as unread from notifications where read_at is null',
      );
      return {
        items: items.map((n) => ({
          ...n,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        })),
        unread: count?.unread ?? 0,
      };
    });
  });

  app.post('/notifications/:id/read', async (request) => {
    const user = requireUser(request);
    const { id } = idParam.parse(request.params);
    return withUser(user.id, async (client) => {
      const result = await client.query(
        'update notifications set read_at = now() where id = $1 and read_at is null',
        [id],
      );
      if (result.rowCount === 0) {
        const exists = await one(client, 'select 1 from notifications where id = $1', [id]);
        if (!exists) throw notFound();
      }
      return { ok: true };
    });
  });

  app.post('/notifications/read-all', async (request) => {
    const user = requireUser(request);
    return withUser(user.id, async (client) => {
      await client.query('update notifications set read_at = now() where read_at is null');
      return { ok: true };
    });
  });
}
