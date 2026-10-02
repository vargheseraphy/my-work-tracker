import { z } from 'zod';

/** Reusable pieces shared by several request bodies. */

export const uuid = z.string().uuid();

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date');

export const monday = isoDate.refine((v) => {
  const day = new Date(`${v}T00:00:00Z`).getUTCDay();
  return day === 1;
}, 'A week starts on a Monday');

export const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');

export const email = z.string().trim().toLowerCase().email().max(254);

/** Minimum 12 characters (docs/SECURITY.md). No maximum beyond argon2's own limit. */
export const password = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'That password is too long');

/** Proof links must be https (docs/SECURITY.md "Links"). */
export const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((v) => v.startsWith('https://'), 'Links must start with https://');

export const metricKey = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/);

export const timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Not a known time zone');

/** ISO weekday numbers, 1 = Monday. */
export const workDays = z.array(z.number().int().min(1).max(7)).min(1).max(7);

/** HH:MM, used for reminder times and deadlines. */
export const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');
