import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesBetween,
  daysInMonth,
  formatDayShort,
  formatMonth,
  formatWeek,
  formatWeekRange,
  isIsoDate,
  isoDayOfWeek,
  weekDays,
  weekMonday,
} from './dates.js';

describe('isIsoDate', () => {
  it('accepts a real date', () => {
    expect(isIsoDate('2026-10-02')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['2026-10-2', '02/10/2026', '2026-13-01', 'today', '']) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
});

describe('addDays', () => {
  it('crosses a month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('goes backwards', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('crosses a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('is unaffected by daylight saving, because dates are UTC', () => {
    // 29 March 2026 is the European clock change; a naive local Date would lose an hour here.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });
});

describe('isoDayOfWeek', () => {
  it('counts Monday as 1 and Sunday as 7, like PostgreSQL isodow', () => {
    expect(isoDayOfWeek('2026-09-28')).toBe(1); // Monday
    expect(isoDayOfWeek('2026-10-02')).toBe(5); // Friday
    expect(isoDayOfWeek('2026-10-04')).toBe(7); // Sunday
  });
});

describe('weekMonday', () => {
  it('returns the Monday of that week', () => {
    expect(weekMonday('2026-10-02')).toBe('2026-09-28');
    expect(weekMonday('2026-09-28')).toBe('2026-09-28');
    expect(weekMonday('2026-10-04')).toBe('2026-09-28'); // Sunday still belongs to its Monday
  });
});

describe('weekDays', () => {
  it('returns Monday to Friday', () => {
    expect(weekDays('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('datesBetween', () => {
  it('includes both ends', () => {
    expect(datesBetween('2026-10-01', '2026-10-03')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('returns nothing when the range is backwards', () => {
    expect(datesBetween('2026-10-03', '2026-10-01')).toEqual([]);
  });
});

describe('formatting', () => {
  it('matches the database wording for a day', () => {
    // to_char(day, 'Dy DD Mon') in submit_entry()
    expect(formatDayShort('2026-10-02')).toBe('Fri 02 Oct');
    expect(formatDayShort('2026-09-30')).toBe('Wed 30 Sep');
  });

  it('formats a week', () => {
    expect(formatWeek('2026-09-28')).toBe('Week of 28 Sep');
    expect(formatWeekRange('2026-09-28')).toBe('28 Sep to 2 Oct');
  });

  it('formats a month', () => {
    expect(formatMonth('2026-10')).toBe('October 2026');
  });
});

describe('daysInMonth', () => {
  it('covers the whole month', () => {
    const days = daysInMonth('2026-10');
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-10-01');
    expect(days.at(-1)).toBe('2026-10-31');
  });

  it('handles February in a leap year', () => {
    expect(daysInMonth('2028-02')).toHaveLength(29);
  });
});
