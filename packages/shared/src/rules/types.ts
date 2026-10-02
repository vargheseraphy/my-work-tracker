import type { MetricDefinition } from '../metrics.js';
import type { IsoDate } from '../dates.js';

/** One answer on an entry. */
export interface EntryValue {
  metricKey: string;
  numValue: number | null;
  textValue: string | null;
  note: string | null;
}

export interface AttachmentRef {
  id: string;
  metricKey: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SearchActivity {
  id: string;
  kind: 'SEO' | 'AEO' | 'GEO';
  description: string;
  link: string | null;
}

export interface DueTask {
  id: string;
  title: string;
  dueDate: IsoDate;
  status: string;
  /** True when a task_updates row exists dated on or after the day being signed off. */
  hasUpdateForDay: boolean;
}

/** The whole picture the client rule mirror needs to check a daily entry. */
export interface DailyCheckInput {
  periodStart: IsoDate;
  /** draft or unlocked means editable. */
  status: 'draft' | 'submitted' | 'late' | 'unlocked';
  /** Enabled, active daily metrics for this person, in sort order. */
  fields: MetricDefinition[];
  values: EntryValue[];
  attachments: AttachmentRef[];
  dueTasks: DueTask[];
  /** Working days still missing a submitted entry, inside the backfill window. */
  missingDaysInWindow: IsoDate[];
  /** Today in the person's time zone, from the server. */
  today: IsoDate;
  /** False when a past day has fallen outside the backfill window. */
  withinBackfill: boolean;
  /** Four-week average per metric key, used for the spike rule. */
  fourWeekAverage: Record<string, number>;
  spikeMultiplier: number;
  spikeMinAverage: number;
}

export interface WeeklyCheckInput {
  periodStart: IsoDate;
  status: 'draft' | 'submitted' | 'late' | 'unlocked';
  /** Enabled, active weekly metrics that are not auto-totalled. */
  fields: MetricDefinition[];
  values: EntryValue[];
  attachments: AttachmentRef[];
  searchActivities: SearchActivity[];
  noSearchActivity: boolean;
  /** Working days of this week still missing a submitted daily entry. */
  missingDaysThisWeek: IsoDate[];
  /** True when the person owns an account at Live, Engaged or Meeting booked. */
  ownsActiveAbmAccount: boolean;
  pickedAbmAccountIds: string[];
  /** True once Friday 16:00 local has passed. The server decides this. */
  isOpen: boolean;
}

/** What the mirror and the server both return. */
export interface CheckResult {
  ok: boolean;
  errors: string[];
}
