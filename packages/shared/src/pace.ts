/**
 * Target, pace and growth maths. Formula from docs/BUSINESS_RULES.md "Targets and pace".
 *
 *   pace share = working days completed this week / working days in the week
 *   ratio      = actual / (target * pace share)
 *   green >= 1.0, amber 0.75 to under 1.0, red under 0.75
 *
 * The word is always shown as well as the colour (docs/DESIGN.md "Behaviour").
 */

export type PaceLevel = 'good' | 'warn' | 'bad' | 'none';

export interface Pace {
  level: PaceLevel;
  /** "On pace", "Close", "Behind", or "No target" when none is set. */
  word: string;
  /** actual / (target * paceShare), or null when there is no target to measure against. */
  ratio: number | null;
  /** Share of the week's working days already finished, 0 to 1. */
  paceShare: number;
  /** What the person should be at by now to be on pace. */
  expected: number | null;
}

export const PACE_WORD: Record<PaceLevel, string> = {
  good: 'On pace',
  warn: 'Close',
  bad: 'Behind',
  none: 'No target',
};

/**
 * @param actual        what the person has done so far this week
 * @param target        the weekly target, or null when none is set
 * @param daysDone      working days of the week already finished
 * @param daysInWeek    working days in the whole week
 */
export function pace(
  actual: number,
  target: number | null | undefined,
  daysDone: number,
  daysInWeek: number,
): Pace {
  const paceShare = daysInWeek > 0 ? clamp(daysDone / daysInWeek, 0, 1) : 0;

  if (target === null || target === undefined || target <= 0) {
    return { level: 'none', word: PACE_WORD.none, ratio: null, paceShare, expected: null };
  }

  const expected = target * paceShare;
  if (expected <= 0) {
    // Nothing is due yet, so nobody can be behind.
    return { level: 'good', word: PACE_WORD.good, ratio: null, paceShare, expected: 0 };
  }

  const ratio = actual / expected;
  const level: PaceLevel = ratio >= 1 ? 'good' : ratio >= 0.75 ? 'warn' : 'bad';
  return { level, word: PACE_WORD[level], ratio, paceShare, expected };
}

/** Share of the weekly target reached, 0 to 1, for the progress bar. */
export function targetShare(actual: number, target: number | null | undefined): number | null {
  if (target === null || target === undefined || target <= 0) return null;
  return clamp(actual / target, 0, 1);
}

export interface Growth {
  /** Absolute change from the previous value. */
  change: number | null;
  /** Change as a share of the previous value, or null when the previous value is 0 or missing. */
  percent: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
}

/** Follower growth week on week (WK-04), and any other week-on-week comparison. */
export function growth(current: number | null, previous: number | null): Growth {
  if (current === null || previous === null) {
    return { change: null, percent: null, direction: 'unknown' };
  }
  const change = current - previous;
  const percent = previous === 0 ? null : change / previous;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { change, percent, direction };
}

/** "+128 (+4.2%)", "-3 (-0.1%)", "No change", or "" when there is nothing to compare. */
export function formatGrowth(g: Growth): string {
  if (g.change === null) return '';
  if (g.change === 0) return 'No change';
  const sign = g.change > 0 ? '+' : '';
  const count = `${sign}${formatNumber(g.change)}`;
  if (g.percent === null) return count;
  return `${count} (${sign}${(g.percent * 100).toFixed(1)}%)`;
}

/** Thousands separators, UK English. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('en-GB').format(value);
}

export function formatPercent(value: number | null | undefined, places = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  return `${value.toFixed(places)}%`;
}

/** Share of a set that is complete, as a whole-number percentage. */
export function completion(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
