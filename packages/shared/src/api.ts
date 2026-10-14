/**
 * Shapes the API returns. The server builds these; the web app consumes them.
 * Keeping them here means a change to a response breaks the type check on both sides.
 */

import type {
  AbmStage,
  AppRole,
  ComplianceStatus,
  DayKind,
  EntryStatus,
  LogType,
  Region,
  SearchKind,
  TaskPriority,
  TaskStatus,
  Vertical,
} from './enums.js';
import type { MetricDefinition } from './metrics.js';
import type { IsoDate } from './dates.js';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  timezone: string;
  /** Today in the person's own time zone, decided by the database. */
  today: IsoDate;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  timezone: string;
  workDays: number[];
  startDate: IsoDate;
  active: boolean;
}

export interface EntryValueDto {
  metricKey: string;
  numValue: number | null;
  textValue: string | null;
  note: string | null;
  updatedAt: string;
}

export interface AttachmentDto {
  id: string;
  metricKey: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
}

export interface SearchActivityDto {
  id: string;
  kind: SearchKind;
  description: string;
  link: string | null;
}

export interface EntryDto {
  id: string;
  userId: string;
  logType: LogType;
  periodStart: IsoDate;
  status: EntryStatus;
  isLate: boolean;
  submittedAt: string | null;
  unlockReason: string | null;
  noSearchActivity: boolean;
  autoTotals: Record<string, number> | null;
  values: EntryValueDto[];
  attachments: AttachmentDto[];
  searchActivities: SearchActivityDto[];
  abmAccountIds: string[];
}

/** Everything the daily or weekly log screen needs in one request. */
export interface EntryScreenDto {
  entry: EntryDto;
  fields: MetricDefinition[];
  today: IsoDate;
  withinBackfill: boolean;
  missingDays: IsoDate[];
  backfillDays: IsoDate[];
  dueTasks: DueTaskDto[];
  fourWeekAverage: Record<string, number>;
  spikeMultiplier: number;
  spikeMinAvg: number;
  dailyDueTime: string;
  /** Weekly only. */
  autoTotals?: Record<string, number>;
  weeklyIsOpen?: boolean;
  previousFollowers?: number | null;
  ownedAbmAccounts?: AbmAccountDto[];
  ownsActiveAbmAccount?: boolean;
}

export interface DueTaskDto {
  id: string;
  title: string;
  dueDate: IsoDate;
  status: TaskStatus;
  priority: TaskPriority;
  hasUpdateForDay: boolean;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string;
  assigneeName: string;
  dueDate: IsoDate;
  priority: TaskPriority;
  status: TaskStatus;
  statusNote: string | null;
  proofUrl: string | null;
  completedAt: string | null;
  isOverdue: boolean;
  isDueToday: boolean;
  createdAt: string;
}

export interface TaskUpdateDto {
  id: string;
  status: TaskStatus;
  note: string | null;
  proofUrl: string | null;
  localDate: IsoDate;
  createdAt: string;
  byName: string;
}

export interface TaskDetailDto extends TaskDto {
  updates: TaskUpdateDto[];
  attachments: AttachmentDto[];
}

export interface AbmAccountDto {
  id: string;
  name: string;
  vertical: Vertical;
  region: Region;
  ownerId: string;
  ownerName: string;
  plannedWeek: IsoDate;
  stage: AbmStage;
  notes: string | null;
  researchUrl: string | null;
  deckUrl: string | null;
  landingUrl: string | null;
  liveAt: string | null;
  isLive: boolean;
}

export interface AbmTouchesDto {
  accountId: string;
  weekStart: IsoDate;
  emails: number;
  messages: number;
  calls: number;
}

export interface AbmWeekPlanDto {
  week: IsoDate;
  account: AbmAccountDto | null;
  /** A past week with no account planned, or an account that never went live. */
  missed: boolean;
}

export interface AbmScreenDto {
  accounts: AbmAccountDto[];
  weekPlan: AbmWeekPlanDto[];
  touches: AbmTouchesDto[];
  currentWeek: IsoDate;
}

export interface NotificationDto {
  id: string;
  ruleKey: string;
  title: string;
  body: string;
  link: string | null;
  localDate: IsoDate;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsDto {
  items: NotificationDto[];
  unread: number;
}

export interface TargetProgressDto {
  metricKey: string;
  label: string;
  actual: number;
  target: number | null;
}

export interface HomeDto {
  user: SessionUser;
  today: IsoDate;
  /** False at a weekend, on a holiday, on leave, or before the person's start date. */
  todayIsWorkingDay: boolean;
  todayStatus: EntryStatus | 'missing';
  missingDays: IsoDate[];
  backfillDays: IsoDate[];
  weekMonday: IsoDate;
  weekDaysDone: number;
  weekDaysTotal: number;
  targets: TargetProgressDto[];
  openTasks: TaskDto[];
  weeklyStatus: EntryStatus | 'missing';
  weeklyIsOpen: boolean;
  abmThisWeek: AbmAccountDto | null;
  streak: StreakDto;
  /** An unread win worth interrupting for. Null almost always. */
  celebration: CelebrationDto | null;
}

/**
 * A moment worth stopping the screen for. It is an ordinary notification row underneath, which
 * is what makes "your manager has been told" true rather than decorative: the manager has a row
 * of their own. Marking it read is what dismisses it, so it shows once and never nags.
 */
export interface CelebrationDto {
  id: string;
  title: string;
  body: string;
}

/**
 * Consistency, counted in working days. Built to encourage: a day counts whether it was on time
 * or late, non-working days and leave are skipped rather than breaking the run, and today still
 * being open never costs you the streak.
 */
export interface StreakDto {
  current: number;
  best: number;
  loggedToday: boolean;
  lastLogged: IsoDate | null;
  /** The next milestone worth reaching, or null once every milestone is passed. */
  nextMilestone: number | null;
}

export interface ComplianceCellDto {
  day: IsoDate;
  status: ComplianceStatus;
}

export interface CompliancePersonDto {
  userId: string;
  fullName: string;
  cells: ComplianceCellDto[];
  submitted: number;
  late: number;
  missing: number;
  expected: number;
}

export interface ComplianceDto {
  month: string;
  days: IsoDate[];
  people: CompliancePersonDto[];
}

export interface DashboardPersonDto {
  userId: string;
  fullName: string;
  targets: TargetProgressDto[];
}

export interface WeekOutcomeDto {
  week: IsoDate;
  meetings: number;
  replies: number;
  accountsAdded: number;
  emails: number;
}

/** One row of "Is it turning into pipeline?": this week beside the week before. */
export interface PipelineRowDto {
  key: string;
  label: string;
  thisWeek: number;
  lastWeek: number;
  /** 'count' or 'percent', which decides how the change is worded. */
  unit: 'count' | 'percent';
}

export interface BacklogRowDto {
  userId: string;
  fullName: string;
  open: number;
  overdue: number;
  done: number;
}

export interface DashboardDto {
  monday: IsoDate;
  /** Working days of this week already finished, and how many the week holds. */
  weekDaysDone: number;
  weekDaysTotal: number;
  people: DashboardPersonDto[];
  outcomes: WeekOutcomeDto[];
  impressions: { week: IsoDate; total: number }[];
  pipeline: PipelineRowDto[];
  kpis: {
    /** Daily logs signed off this week, out of the days expected so far. */
    logsDone: number;
    logsExpected: number;
    /** Working days behind the team with no entry, and who the oldest one belongs to. */
    missingCount: number;
    missingLabel: string | null;
    openTasks: number;
    overdueTasks: number;
    /** Last week's weekly logs. */
    weeklyLogsDone: number;
    weeklyLogsExpected: number;
  };
  abm: AbmWeekPlanDto[];
  /** Weeks each account has been live, keyed by account id. */
  abmWeeksLive: Record<string, number>;
  backlog: BacklogRowDto[];
  overdue: TaskDto[];
  searchActivities: (SearchActivityDto & { userName: string; week: IsoDate })[];
}

export interface PersonDayDto {
  day: IsoDate;
  entryId: string | null;
  status: EntryStatus | 'missing';
  isLate: boolean;
  values: EntryValueDto[];
  attachments: AttachmentDto[];
}

export interface PersonDetailDto {
  profile: Profile;
  today: IsoDate;
  days: PersonDayDto[];
  weeklyEntries: EntryDto[];
  fields: MetricDefinition[];
  tasks: TaskDto[];
  targets: TargetProgressDto[];
}

export interface CalendarDayDto {
  id: string;
  day: IsoDate;
  kind: DayKind;
  label: string;
  userId: string | null;
  userName: string | null;
}

export interface ReminderRuleDto {
  key: string;
  description: string;
  localTime: string;
  dow: number | null;
  toAdmin: boolean;
  email: boolean;
  inApp: boolean;
  active: boolean;
}

export interface AppSettingsDto {
  dailyDueTime: string;
  weeklyOpenTime: string;
  weeklyDueTime: string;
  backfillWorkingDays: number;
  spikeMultiplier: number;
  spikeMinAvg: number;
  reportRecipients: string[];
}

export interface UserSettingRowDto {
  userId: string;
  metricKey: string;
  enabled: boolean;
  weeklyTarget: number | null;
}

export interface SettingsScreenDto {
  people: Profile[];
  metrics: MetricDefinition[];
  settings: UserSettingRowDto[];
  reminders: ReminderRuleDto[];
  app: AppSettingsDto;
}

export interface ReportPersonDto {
  userId: string;
  fullName: string;
  daysSubmitted: number;
  daysExpected: number;
  late: number;
  targets: TargetProgressDto[];
  reflections: { worked: string; notWorked: string; focus: string } | null;
}

export interface ReportDto {
  monday: IsoDate;
  range: string;
  people: ReportPersonDto[];
  totals: {
    accountsAdded: number;
    emails: number;
    replies: number;
    posts: number;
    calls: number;
    meetings: number;
    impressions: number;
  };
  previousTotals: ReportDto['totals'] | null;
  abm: AbmWeekPlanDto[];
  tasks: { open: number; overdue: number; doneThisWeek: number };
  searchActivities: (SearchActivityDto & { userName: string })[];
  compliance: { submitted: number; late: number; missing: number; expected: number };
}

/** The envelope every failing request returns. */
export interface ApiError {
  error: 'invalid' | 'signin' | 'forbidden' | 'rule' | 'not_found' | 'server' | 'too_many';
  message?: string;
  fields?: Record<string, string>;
}

/** What submit_entry() returns, passed through unchanged. */
export type SubmitResult =
  | { ok: true; status: 'submitted' | 'late' }
  | { ok: false; errors: string[] };
