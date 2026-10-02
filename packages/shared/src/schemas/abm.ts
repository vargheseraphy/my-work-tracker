import { z } from 'zod';
import { ABM_STAGES, REGIONS, VERTICALS } from '../enums.js';
import { monday, uuid } from './common.js';

const optionalUrl = z.string().trim().url().max(2000).nullable().optional();

export const createAbmBody = z.object({
  name: z.string().trim().min(1).max(120),
  vertical: z.enum(VERTICALS),
  region: z.enum(REGIONS),
  ownerId: uuid,
  plannedWeek: monday,
  stage: z.enum(ABM_STAGES).default('Research'),
  notes: z.string().trim().max(4000).nullable().optional(),
});
export type CreateAbmBody = z.infer<typeof createAbmBody>;

/** Owners may change the working fields; only an admin may change the first five.
 *  The database trigger guard_abm_owner_update() enforces that, not this schema. */
export const patchAbmBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    vertical: z.enum(VERTICALS).optional(),
    region: z.enum(REGIONS).optional(),
    ownerId: uuid.optional(),
    plannedWeek: monday.optional(),
    stage: z.enum(ABM_STAGES).optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    researchUrl: optionalUrl,
    deckUrl: optionalUrl,
    landingUrl: optionalUrl,
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type PatchAbmBody = z.infer<typeof patchAbmBody>;

export const putTouchesBody = z.object({
  emails: z.number().int().min(0).max(100000),
  messages: z.number().int().min(0).max(100000),
  calls: z.number().int().min(0).max(100000),
});
export type PutTouchesBody = z.infer<typeof putTouchesBody>;
