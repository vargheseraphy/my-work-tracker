import type { FastifyInstance } from 'fastify';
import { schemas, formatMonth } from '@gtm/shared';
import { withUser } from '../db.js';
import { requireAdminOrViewer } from '../context.js';
import { buildReport, monthlyCsv } from './service.js';

export async function reportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/report', async (request) => {
    const user = requireAdminOrViewer(request);
    const { monday } = schemas.reportQuery.parse(request.query ?? {});
    return withUser(user.id, async (client) => ({ report: await buildReport(client, monday) }));
  });

  app.get('/admin/export.csv', async (request, reply) => {
    const user = requireAdminOrViewer(request);
    const { month } = schemas.exportQuery.parse(request.query ?? {});
    const csv = await withUser(user.id, async (client) => monthlyCsv(client, month));

    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="gtm-${formatMonth(month).toLowerCase().replace(' ', '-')}.csv"`,
    );
    // A byte-order mark, so Excel opens the file as UTF-8.
    return reply.send(`\uFEFF${csv}`);
  });
}
