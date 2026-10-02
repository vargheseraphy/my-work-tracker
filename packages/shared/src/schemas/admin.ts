import { z } from 'zod';
import { APP_ROLES, DAY_KINDS } from '../enums.js';
import { email, isoDate, localTime, metricKey, monday, monthKey, timezone, uuid, workDays } from './common.js';

export const complianceQuery = z.object({ month: monthKey });
export type ComplianceQuery = z.infer<typeof complianceQuery>;

export const weekQuery = z.object({ monday });
export type WeekQuery = z.infer<typeof weekQuery>;

export const personQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(10),
});
export type PersonQuery = z.infer<typeof personQuery>;

export const putTargetsBody = z.object({
  targets: z
    .array(
      z.object({
        userId: uuid,
        metricKey,
        weeklyTarget: z.number().int().min(0).max(1_000_000).nullable(),
      }),
    )
    .max(500),
});
export type PutTargetsBody = z.infer<typeof putTargetsBody>;

export const putFieldsBody = z.object({
  fields: z
    .array(
      z.object({
        userId: uuid,
        metricKey,
        enabled: z.boolean(),
      }),
    )
    .max(1000),
});
export type PutFieldsBody = z.infer<typeof putFieldsBody>;

export const putRemindersBody = z.object({
  rules: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        localTime,
        email: z.boolean(),
        inApp: z.boolean(),
        active: z.boolean(),
      }),
    )
    .max(50),
});
export type PutRemindersBody = z.infer<typeof putRemindersBody>;

export const putAppSettingsBody = z.object({
  dailyDueTime: localTime.optional(),
  weeklyOpenTime: localTime.optional(),
  weeklyDueTime: localTime.optional(),
  backfillWorkingDays: z.number().int().min(0).max(10).optional(),
  spikeMultiplier: z.number().min(1).max(100).optional(),
  spikeMinAvg: z.number().min(0).max(10000).optional(),
  reportRecipients: z.array(email).max(20).optional(),
});
export type PutAppSettingsBody = z.infer<typeof putAppSettingsBody>;

export const createCalendarDayBody = z
  .object({
    day: isoDate,
    kind: z.enum(DAY_KINDS),
    label: z.string().trim().min(1).max(80),
    userId: uuid.nullable().optional(),
  })
  .refine(
    (v) => (v.kind === 'holiday') === (v.userId === null || v.userId === undefined),
    'A holiday is for everyone; leave is for one person',
  );
export type CreateCalendarDayBody = z.infer<typeof createCalendarDayBody>;

export const calendarQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuery>;

export const inviteUserBody = z.object({
  email,
  fullName: z.string().trim().min(1).max(80),
  role: z.enum(APP_ROLES).default('contributor'),
  timezone: timezone.default('Asia/Kolkata'),
  workDays: workDays.optional(),
  startDate: isoDate.optional(),
});
export type InviteUserBody = z.infer<typeof inviteUserBody>;

export const patchUserBody = z
  .object({
    fullName: z.string().trim().min(1).max(80).optional(),
    role: z.enum(APP_ROLES).optional(),
    timezone: timezone.optional(),
    workDays: workDays.optional(),
    startDate: isoDate.optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type PatchUserBody = z.infer<typeof patchUserBody>;

export const reportQuery = z.object({ monday });
export type ReportQuery = z.infer<typeof reportQuery>;

export const exportQuery = z.object({ month: monthKey });
export type ExportQuery = z.infer<typeof exportQuery>;
