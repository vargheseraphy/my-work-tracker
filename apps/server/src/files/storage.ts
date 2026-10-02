/**
 * Proof files on disk. One interface, so swapping this for S3-compatible storage later changes
 * nothing else (docs/TECH_SPEC.md section 6).
 *
 * Path: UPLOAD_DIR/{userId}/{entryId or taskId}/{uuid}.{ext}
 * The uploaded file name is never used in the path.
 */

import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

/** The only types allowed, matching the attachments check constraint. */
export const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface StoredFile {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Work out the real type from the first bytes, never from what the browser claimed
 * (docs/SECURITY.md "Files").
 */
export async function detectType(buffer: Buffer): Promise<string> {
  const found = await fileTypeFromBuffer(buffer);
  const mime = found?.mime ?? '';
  if (!ALLOWED_TYPES[mime]) {
    throw new HttpError(400, {
      error: 'invalid',
      fields: { file: 'Attach a PNG, JPEG, WebP or PDF' },
    });
  }
  return mime;
}

export async function store(
  buffer: Buffer,
  ownerId: string,
  parentId: string,
): Promise<StoredFile> {
  const cfg = config();
  if (buffer.byteLength === 0) {
    throw new HttpError(400, { error: 'invalid', fields: { file: 'That file is empty' } });
  }
  if (buffer.byteLength > cfg.MAX_UPLOAD_BYTES) {
    throw new HttpError(413, { error: 'invalid', fields: { file: 'That file is too large' } });
  }

  const mimeType = await detectType(buffer);
  const storagePath = `${ownerId}/${parentId}/${randomUUID()}.${ALLOWED_TYPES[mimeType]}`;
  const full = resolve(cfg.uploadDir, storagePath);

  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, buffer, { mode: 0o600 });

  return { storagePath, mimeType, sizeBytes: buffer.byteLength };
}

/** Never let a stored path escape the upload directory. */
function fullPath(storagePath: string): string {
  const cfg = config();
  const full = resolve(cfg.uploadDir, storagePath);
  if (!full.startsWith(resolve(cfg.uploadDir) + '/')) {
    throw new HttpError(404, { error: 'not_found' });
  }
  return full;
}

export function read(storagePath: string): ReadStream {
  return createReadStream(fullPath(storagePath));
}

export async function remove(storagePath: string): Promise<void> {
  await rm(fullPath(storagePath), { force: true });
}

export function uploadRoot(): string {
  return config().uploadDir;
}

export function pathFor(ownerId: string, parentId: string, name: string): string {
  return join(ownerId, parentId, name);
}
