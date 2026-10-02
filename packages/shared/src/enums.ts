/**
 * Enum values that mirror the PostgreSQL types created in db/migrations/0001_schema.sql.
 * The database is the source of truth: never add a value here without a migration.
 */

export const APP_ROLES = ['admin', 'contributor', 'viewer'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const LOG_TYPES = ['daily', 'weekly'] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const VALUE_TYPES = ['int', 'percent', 'text', 'file', 'list'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const PROOF_TYPES = ['none', 'file', 'link'] as const;
export type ProofType = (typeof PROOF_TYPES)[number];

export const ENTRY_STATUSES = ['draft', 'submitted', 'late', 'unlocked'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const TASK_STATUSES = [
  'Not started',
  'In progress',
  'Blocked',
  'Done',
  'Cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const ABM_STAGES = [
  'Research',
  'Assets ready',
  'Live',
  'Engaged',
  'Meeting booked',
  'Closed',
] as const;
export type AbmStage = (typeof ABM_STAGES)[number];

/** Stages that count as the week's account having gone live. */
export const ABM_LIVE_STAGES: readonly AbmStage[] = ['Live', 'Engaged', 'Meeting booked', 'Closed'];

/** Stages that mean the owner must pick the account on the weekly log. */
export const ABM_ACTIVE_STAGES: readonly AbmStage[] = ['Live', 'Engaged', 'Meeting booked'];

export const VERTICALS = ['Yallo Talent', 'saasinator AI', 'Yallo AI Academy'] as const;
export type Vertical = (typeof VERTICALS)[number];

export const REGIONS = ['UAE', 'KSA', 'UK', 'India', 'Other'] as const;
export type Region = (typeof REGIONS)[number];

export const DAY_KINDS = ['holiday', 'leave'] as const;
export type DayKind = (typeof DAY_KINDS)[number];

export const SEARCH_KINDS = ['SEO', 'AEO', 'GEO'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** Cell states returned by dashboard_compliance(). */
export const COMPLIANCE_STATUSES = [
  'submitted',
  'late',
  'missing',
  'due',
  'holiday',
  'leave',
  'off',
  'future',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const EMAIL_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Words shown beside the status colour, so colour is never the only signal. */
export const ENTRY_STATUS_LABEL: Record<EntryStatus | 'missing', string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  late: 'Late',
  unlocked: 'Unlocked',
  missing: 'Missing',
};

export const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  submitted: 'Submitted',
  late: 'Late',
  missing: 'Missing',
  due: 'Due today',
  holiday: 'Holiday',
  leave: 'Leave',
  off: 'Non-working day',
  future: 'Not yet',
};
