import { z } from 'zod';
import { LOG_TYPES, SEARCH_KINDS } from '../enums.js';
import { isoDate, uuid } from './common.js';

export const openEntryBody = z.object({
  type: z.enum(LOG_TYPES),
  period: isoDate,
});
export type OpenEntryBody = z.infer<typeof openEntryBody>;

/** Autosave of one field. Mirrors the entry_values constraints in 0001_schema.sql. */
export const putValueBody = z
  .object({
    numValue: z.number().min(0).max(1_000_000_000).nullable().optional(),
    textValue: z.string().max(2000).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => v.numValue !== undefined || v.textValue !== undefined || v.note !== undefined,
    'Send at least one of numValue, textValue or note',
  );
export type PutValueBody = z.infer<typeof putValueBody>;

export const patchEntryBody = z.object({
  noSearchActivity: z.boolean(),
});
export type PatchEntryBody = z.infer<typeof patchEntryBody>;

export const listEntriesQuery = z.object({
  type: z.enum(LOG_TYPES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type ListEntriesQuery = z.infer<typeof listEntriesQuery>;

export const searchActivityBody = z.object({
  kind: z.enum(SEARCH_KINDS),
  description: z.string().trim().min(1).max(300),
  link: z
    .string()
    .trim()
    .max(2000)
    .regex(/^https?:\/\//, 'Links must start with http:// or https://')
    .nullable()
    .optional(),
});
export type SearchActivityBody = z.infer<typeof searchActivityBody>;

export const putAbmAccountsBody = z.object({
  accountIds: z.array(uuid).max(50),
});
export type PutAbmAccountsBody = z.infer<typeof putAbmAccountsBody>;

export const unlockBody = z.object({
  userId: uuid,
  type: z.enum(LOG_TYPES),
  period: isoDate,
  reason: z.string().trim().min(1).max(500),
});
export type UnlockBody = z.infer<typeof unlockBody>;
