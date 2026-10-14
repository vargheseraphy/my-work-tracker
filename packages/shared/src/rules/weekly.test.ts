import { describe, expect, it } from 'vitest';
import type { MetricDefinition } from '../metrics.js';
import { msg } from './messages.js';
import type { WeeklyCheckInput } from './types.js';
import { checkWeekly, weeklyProgress } from './weekly.js';

function field(over: Partial<MetricDefinition> & { key: string; label: string }): MetricDefinition {
  return {
    logType: 'weekly',
    groupName: 'Outreach',
    valueType: 'int',
    proof: 'none',
    autoFrom: null,
    isTargetMeasure: false,
    sortOrder: 10,
    perBrand: false,
    ...over,
  };
}

const CALLS = field({ key: 'wk_calls', label: 'Calls made' });
const OPEN_RATE = field({
  key: 'wk_open_rate',
  label: 'Email open rate (%)',
  valueType: 'percent',
  proof: 'file',
});
const FORMS = field({ key: 'wk_forms', label: 'Website form responses', groupName: 'Website' });
const COMPANIES = field({
  key: 'wk_form_companies',
  label: 'Which companies?',
  valueType: 'text',
  groupName: 'Website',
});
const GA = field({
  key: 'wk_ga_report',
  label: 'Google Analytics weekly report',
  valueType: 'file',
  groupName: 'Website',
});
const SEARCH = field({
  key: 'wk_search',
  label: 'SEO, AEO and GEO activities',
  valueType: 'list',
  groupName: 'Search',
});
const FOCUS = field({
  key: 'wk_reflect_focus',
  label: 'Your one focus for next week',
  valueType: 'text',
  groupName: 'Reflection',
});

function input(over: Partial<WeeklyCheckInput> = {}): WeeklyCheckInput {
  return {
    periodStart: '2026-09-28',
    status: 'draft',
    fields: [CALLS, OPEN_RATE, FORMS, COMPANIES, GA, SEARCH, FOCUS],
    values: [
      { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
      { metricKey: 'wk_open_rate', numValue: 41, textValue: null, note: null },
      { metricKey: 'wk_forms', numValue: 0, textValue: null, note: null },
      { metricKey: 'wk_reflect_focus', numValue: null, textValue: 'Book two meetings', note: null },
    ],
    attachments: [
      {
        id: 'a1',
        metricKey: 'wk_open_rate',
        fileName: 'open.png',
        mimeType: 'image/png',
        sizeBytes: 10,
      },
      {
        id: 'a2',
        metricKey: 'wk_ga_report',
        fileName: 'ga.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    ],
    searchActivities: [],
    noSearchActivity: true,
    missingDaysThisWeek: [],
    ownsActiveAbmAccount: false,
    pickedAbmAccountIds: [],
    isOpen: true,
    ...over,
  };
}

describe('a complete weekly log', () => {
  it('passes', () => {
    expect(checkWeekly(input())).toEqual({ ok: true, errors: [] });
  });

  it('is refused once submitted', () => {
    expect(checkWeekly(input({ status: 'submitted' })).errors).toEqual([msg.locked]);
  });
});

describe('WK-03 · entered fields with proof', () => {
  it('asks for the open rate screenshot', () => {
    const result = checkWeekly(input({ attachments: [input().attachments[1]!] }));
    expect(result.errors).toContain('Email open rate (%): attach a screenshot');
  });

  it('refuses an open rate above 100', () => {
    const result = checkWeekly(
      input({
        values: [
          { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
          { metricKey: 'wk_open_rate', numValue: 120, textValue: null, note: null },
          { metricKey: 'wk_forms', numValue: 0, textValue: null, note: null },
          { metricKey: 'wk_reflect_focus', numValue: null, textValue: 'x', note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Email open rate (%): enter 0 to 100');
  });

  it('asks for the Google Analytics upload', () => {
    const result = checkWeekly(input({ attachments: [input().attachments[0]!] }));
    expect(result.errors).toContain('Google Analytics weekly report: upload it');
  });
});

describe('company names are only required above 0 form responses', () => {
  it('is not asked for at 0', () => {
    expect(checkWeekly(input()).ok).toBe(true);
  });

  it('is asked for above 0', () => {
    const result = checkWeekly(
      input({
        values: [
          { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
          { metricKey: 'wk_open_rate', numValue: 41, textValue: null, note: null },
          { metricKey: 'wk_forms', numValue: 3, textValue: null, note: null },
          { metricKey: 'wk_reflect_focus', numValue: null, textValue: 'x', note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Which companies?: required');
  });
});

describe('WK-05 · search activities', () => {
  it('refuses an empty list when "none this week" is not ticked', () => {
    expect(checkWeekly(input({ noSearchActivity: false })).errors).toContain(msg.searchActivities);
  });

  it('accepts one row instead', () => {
    const result = checkWeekly(
      input({
        noSearchActivity: false,
        searchActivities: [
          { id: 's1', kind: 'SEO', description: 'Rewrote the pricing page title', link: null },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('WK-07 · reflections', () => {
  it('refuses a blank reflection', () => {
    const result = checkWeekly(
      input({
        values: [
          { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
          { metricKey: 'wk_open_rate', numValue: 41, textValue: null, note: null },
          { metricKey: 'wk_forms', numValue: 0, textValue: null, note: null },
          { metricKey: 'wk_reflect_focus', numValue: null, textValue: '   ', note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Your one focus for next week: required');
  });

  it('refuses more than 500 characters', () => {
    const result = checkWeekly(
      input({
        values: [
          { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
          { metricKey: 'wk_open_rate', numValue: 41, textValue: null, note: null },
          { metricKey: 'wk_forms', numValue: 0, textValue: null, note: null },
          { metricKey: 'wk_reflect_focus', numValue: null, textValue: 'x'.repeat(501), note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Your one focus for next week: keep it under 500 characters');
  });
});

describe('WK-01 · the weekly log opens on Friday at 16:00', () => {
  it('refuses before then', () => {
    expect(checkWeekly(input({ isOpen: false })).errors).toContain(msg.weeklyNotOpen);
  });
});

describe('a week with missing daily logs cannot be signed off', () => {
  it('refuses', () => {
    expect(checkWeekly(input({ missingDaysThisWeek: ['2026-09-30'] })).errors).toContain(
      msg.weeklyMissingDays,
    );
  });
});

describe('WK-06 · ABM accounts worked', () => {
  it('asks the owner of a live account to pick one', () => {
    expect(checkWeekly(input({ ownsActiveAbmAccount: true })).errors).toContain(msg.abmPickOne);
  });

  it('is satisfied by one pick', () => {
    const result = checkWeekly(
      input({ ownsActiveAbmAccount: true, pickedAbmAccountIds: ['abc'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('does not ask someone who owns no live account', () => {
    expect(checkWeekly(input()).ok).toBe(true);
  });
});

describe('weeklyProgress', () => {
  it('leaves out company names when there are no form responses', () => {
    const p = weeklyProgress(input());
    expect(p.total).toBe(6);
    expect(p.missing).toEqual([]);
  });

  it('counts company names once there are responses', () => {
    const p = weeklyProgress(
      input({
        values: [
          { metricKey: 'wk_calls', numValue: 4, textValue: null, note: null },
          { metricKey: 'wk_open_rate', numValue: 41, textValue: null, note: null },
          { metricKey: 'wk_forms', numValue: 2, textValue: null, note: null },
          { metricKey: 'wk_reflect_focus', numValue: null, textValue: 'x', note: null },
        ],
      }),
    );
    expect(p.total).toBe(7);
    expect(p.missing).toEqual(['Which companies?']);
  });
});
