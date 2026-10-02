/**
 * Date helpers. Everything here works on plain `YYYY-MM-DD` strings so that a browser time zone
 * can never shift a day. "Today" always comes from the database (local_today), never from here.
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** Parse YYYY-MM-DD as a UTC instant, so arithmetic never crosses a daylight-saving boundary. */
export function parseIsoDate(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Not a date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** ISO weekday: 1 = Monday to 7 = Sunday, matching PostgreSQL's `isodow`. */
export function isoDayOfWeek(value: IsoDate): number {
  const day = parseIsoDate(value).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday of the week containing this day. Mirrors public.week_monday(). */
export function weekMonday(value: IsoDate): IsoDate {
  return addDays(value, -(isoDayOfWeek(value) - 1));
}

/** Every date from `from` to `to` inclusive. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday to Friday of the week containing this day. */
export function weekDays(monday: IsoDate): IsoDate[] {
  return [0, 1, 2, 3, 4].map((n) => addDays(monday, n));
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Thu 02 Oct" — the wording used in the database messages and the prototypes. */
export function formatDayShort(value: IsoDate): string {
  const d = parseIsoDate(value);
  return `${DAY_SHORT[isoDayOfWeek(value) - 1]} ${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** "Thursday 2 October" for page headings. */
export function formatDayLong(value: IsoDate): string {
  const d = parseIsoDate(value);
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${DAY_LONG[isoDayOfWeek(value) - 1]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** "02 Oct" */
export function formatDayMonth(value: IsoDate): string {
  const d = parseIsoDate(value);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** "Week of 29 Sep" */
export function formatWeek(monday: IsoDate): string {
  const d = parseIsoDate(monday);
  return `Week of ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** "29 Sep to 3 Oct" */
export function formatWeekRange(monday: IsoDate): string {
  const start = parseIsoDate(monday);
  const end = parseIsoDate(addDays(monday, 4));
  return `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]} to ${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]}`;
}

/** "2026-10" for the month picker and the CSV export. */
export function monthKey(value: IsoDate): string {
  return value.slice(0, 7);
}

export function monthStart(month: string): IsoDate {
  return `${month}-01`;
}

/** "October 2026" */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${months[Number(m) - 1]} ${year}`;
}

export function daysInMonth(month: string): IsoDate[] {
  const start = monthStart(month);
  const d = parseIsoDate(start);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return datesBetween(start, toIsoDate(last));
}
