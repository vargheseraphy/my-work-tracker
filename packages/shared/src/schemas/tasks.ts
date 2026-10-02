import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../enums.js';
import { httpsUrl, isoDate, uuid } from './common.js';

export const createTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  assigneeId: uuid,
  dueDate: isoDate,
  priority: z.enum(TASK_PRIORITIES).default('Medium'),
});
export type CreateTaskBody = z.infer<typeof createTaskBody>;

export const patchTaskBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    assigneeId: uuid.optional(),
    dueDate: isoDate.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    /** Only an admin may cancel, and cancelling is the only status change on this route. */
    cancel: z.literal(true).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type PatchTaskBody = z.infer<typeof patchTaskBody>;

export const taskStatusBody = z.object({
  status: z.enum(TASK_STATUSES),
  note: z.string().trim().max(1000).nullable().optional(),
  proofUrl: httpsUrl.nullable().optional(),
});
export type TaskStatusBody = z.infer<typeof taskStatusBody>;

export const listTasksQuery = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  owner: z.union([uuid, z.literal('me'), z.literal('all')]).optional(),
  overdue: z.enum(['true', 'false']).optional(),
});
export type ListTasksQuery = z.infer<typeof listTasksQuery>;
