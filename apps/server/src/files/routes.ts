/**
 * Upload, download and delete proof files (DAY-04, DAY-11, TSK-02).
 *
 * The attachments row is inserted inside withUser, so row-level security decides whether the
 * upload is allowed at all. A download streams the file only after its row has been read as the
 * signed-in person: no row means 404, never a file.
 */

import type { FastifyInstance } from 'fastify';
import { schemas, type AttachmentDto } from '@gtm/shared';
import { z } from 'zod';
import { one, withUser } from '../db.js';
import { requireContributor, requireUser } from '../context.js';
import { HttpError, notFound } from '../errors.js';
import { read, remove, store } from './storage.js';

const idParam = z.object({ id: schemas.uuid });

/** Five files per field (DAY-11). */
const MAX_PER_FIELD = 5;

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/entries/:id/attachments', async (request, reply) => {
    const user = requireContributor(request);
    const { id: entryId } = idParam.parse(request.params);

    const upload = await readUpload(request);
    const metricKey = schemas.metricKey.parse(upload.fields.metricKey);

    const attachment = await withUser(user.id, async (client) => {
      const entry = await one<{ id: string }>(
        client,
        `select id from entries where id = $1 and user_id = $2 and status in ('draft', 'unlocked')`,
        [entryId, user.id],
      );
      if (!entry) throw notFound();

      const count = await one<{ n: number }>(
        client,
        'select count(*)::int as n from attachments where entry_id = $1 and metric_key = $2',
        [entryId, metricKey],
      );
      if ((count?.n ?? 0) >= MAX_PER_FIELD) {
        throw new HttpError(409, {
          error: 'rule',
          message: `Up to ${MAX_PER_FIELD} files for each field`,
        });
      }

      const stored = await store(upload.buffer, user.id, entryId);
      return insertAttachment(client, {
        ownerId: user.id,
        entryId,
        taskId: null,
        metricKey,
        fileName: upload.fileName,
        ...stored,
      });
    });

    return reply.status(201).send({ attachment });
  });

  app.post('/tasks/:id/attachments', async (request, reply) => {
    const user = requireContributor(request);
    const { id: taskId } = idParam.parse(request.params);
    const upload = await readUpload(request);

    const attachment = await withUser(user.id, async (client) => {
      const task = await one<{ id: string }>(
        client,
        'select id from tasks where id = $1 and assignee_id = $2',
        [taskId, user.id],
      );
      if (!task) throw notFound();

      const stored = await store(upload.buffer, user.id, taskId);
      return insertAttachment(client, {
        ownerId: user.id,
        entryId: null,
        taskId,
        metricKey: null,
        fileName: upload.fileName,
        ...stored,
      });
    });

    return reply.status(201).send({ attachment });
  });

  /** Stream a file, but only after its row is readable by the caller. */
  app.get('/files/:id', async (request, reply) => {
    const user = requireUser(request);
    const { id } = idParam.parse(request.params);

    const row = await withUser(user.id, async (client) =>
      one<{ storage_path: string; mime_type: string; file_name: string }>(
        client,
        'select storage_path, mime_type, file_name from attachments where id = $1',
        [id],
      ),
    );
    if (!row) throw notFound();

    reply.header('Content-Type', row.mime_type);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'private, max-age=0, no-store');
    reply.header(
      'Content-Disposition',
      `inline; filename="${row.file_name.replace(/[^\w.\- ]/g, '_')}"`,
    );
    return reply.send(read(row.storage_path));
  });

  app.delete('/attachments/:id', async (request, reply) => {
    const user = requireContributor(request);
    const { id } = idParam.parse(request.params);

    const storagePath = await withUser(user.id, async (client) => {
      const row = await one<{ storage_path: string }>(
        client,
        'delete from attachments where id = $1 returning storage_path',
        [id],
      );
      if (!row) throw notFound();
      return row.storage_path;
    });

    // The row went first: if the file is already gone, the row is still correctly removed.
    await remove(storagePath);
    return reply.status(204).send();
  });
}

interface Upload {
  buffer: Buffer;
  fileName: string;
  fields: Record<string, string>;
}

async function readUpload(request: Parameters<typeof requireUser>[0]): Promise<Upload> {
  const data = await request.file();
  if (!data) {
    throw new HttpError(400, { error: 'invalid', fields: { file: 'Attach a file' } });
  }

  const buffer = await data.toBuffer();
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.fields ?? {})) {
    const field = Array.isArray(value) ? value[0] : value;
    if (field && 'value' in field && typeof field.value === 'string') {
      fields[key] = field.value;
    }
  }

  return { buffer, fileName: (data.filename ?? 'proof').slice(0, 200), fields };
}

async function insertAttachment(
  client: Parameters<typeof one>[0],
  input: {
    ownerId: string;
    entryId: string | null;
    taskId: string | null;
    metricKey: string | null;
    fileName: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<AttachmentDto> {
  const row = await one<{
    id: string;
    metricKey: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: Date;
  }>(
    client,
    `insert into attachments
       (owner_id, entry_id, task_id, metric_key, storage_path, file_name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, metric_key as "metricKey", file_name as "fileName", mime_type as "mimeType",
               size_bytes as "sizeBytes", created_at as "createdAt"`,
    [
      input.ownerId,
      input.entryId,
      input.taskId,
      input.metricKey,
      input.storagePath,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
    ],
  );
  return {
    ...row!,
    createdAt: row!.createdAt.toISOString(),
    url: `/api/files/${row!.id}`,
  };
}
