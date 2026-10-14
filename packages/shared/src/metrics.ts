/**
 * Metric keys, mirroring db/migrations/0004_reference_data.sql.
 * Keys never change (docs/DATABASE.md "Metric keys"). Labels and grouping come from the
 * database at runtime; these constants exist so code can refer to a key safely.
 */

export const DAILY_METRIC_KEYS = [
  'posts',
  'comments',
  'likes',
  'dms',
  'emails',
  'templates',
  'replies',
  'accounts_found',
  'accounts_added',
  'contacts_added',
  'contacts_filtered',
  'posters',
  'newsletters',
] as const;
export type DailyMetricKey = (typeof DAILY_METRIC_KEYS)[number];

export const WEEKLY_METRIC_KEYS = [
  'wk_accounts_added',
  'wk_emails',
  'wk_replies',
  'wk_posts',
  'wk_calls',
  'wk_meetings',
  'wk_open_rate',
  'wk_impressions',
  'wk_followers',
  'wk_forms',
  'wk_form_companies',
  'wk_ga_report',
  'wk_ga_users',
  'wk_ga_sessions',
  'wk_ga_top_page',
  'wk_search',
  'wk_reflect_worked',
  'wk_reflect_not',
  'wk_reflect_focus',
] as const;
export type WeeklyMetricKey = (typeof WEEKLY_METRIC_KEYS)[number];

export type MetricKey = DailyMetricKey | WeeklyMetricKey;

/** Weekly metrics summed automatically from a daily metric; read-only on the weekly log. */
export const WEEKLY_AUTO_FROM: Partial<Record<WeeklyMetricKey, DailyMetricKey>> = {
  wk_accounts_added: 'accounts_added',
  wk_emails: 'emails',
  wk_replies: 'replies',
  wk_posts: 'posts',
};

/** Measures a weekly target can be set against (user_metric_settings.weekly_target). */
export const TARGET_MEASURES = [
  'posts',
  'dms',
  'emails',
  'accounts_added',
  'contacts_added',
  'wk_calls',
  'wk_meetings',
] as const;
export type TargetMeasure = (typeof TARGET_MEASURES)[number];

/** Group order used on the daily and weekly logs; matches the prototypes. */
export const DAILY_GROUP_ORDER = ['LinkedIn', 'Email', 'Accounts', 'Content'] as const;
export const WEEKLY_GROUP_ORDER = [
  'Outreach',
  'Social',
  'Website',
  'Search',
  'ABM',
  'Reflection',
] as const;

/** A metric definition row as the API returns it. */
export interface MetricDefinition {
  key: string;
  label: string;
  logType: 'daily' | 'weekly';
  groupName: string;
  valueType: 'int' | 'percent' | 'text' | 'file' | 'list';
  proof: 'none' | 'file' | 'link';
  autoFrom: string | null;
  isTargetMeasure: boolean;
  sortOrder: number;
  /** Answered once per brand the person is assigned (db/migrations/0013). */
  perBrand: boolean;
}

export function isDailyMetricKey(key: string): key is DailyMetricKey {
  return (DAILY_METRIC_KEYS as readonly string[]).includes(key);
}

export function isWeeklyMetricKey(key: string): key is WeeklyMetricKey {
  return (WEEKLY_METRIC_KEYS as readonly string[]).includes(key);
}
