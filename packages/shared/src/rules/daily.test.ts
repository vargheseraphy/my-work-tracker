import { describe, expect, it } from 'vitest';
import type { MetricDefinition } from '../metrics.js';
import { checkDaily, dailyProgress } from './daily.js';
import { msg } from './messages.js';
import type { DailyCheckInput } from './types.js';

function field(over: Partial<MetricDefinition> & { key: string; label: string }): MetricDefinition {
  return {
    logType: 'daily',
    groupName: 'Accounts',
    valueType: 'int',
    proof: 'none',
    autoFrom: null,
    isTargetMeasure: false,
    sortOrder: 10,
    perBrand: false,
    ...over,
  };
}

const POSTS = field({ key: 'posts', label: 'Posts published', proof: 'link', groupName: 'LinkedIn' });
const COMMENTS = field({ key: 'comments', label: 'Comments made', proof: 'file', groupName: 'LinkedIn' });
const ADDED = field({ key: 'contacts_added', label: 'Contacts added' });
const FILTERED = field({ key: 'contacts_filtered', label: 'Contacts filtered (qualified)' });

function input(over: Partial<DailyCheckInput> = {}): DailyCheckInput {
  return {
    periodStart: '2026-10-02',
    status: 'draft',
    fields: [POSTS, COMMENTS, ADDED, FILTERED],
    values: [
      { metricKey: 'posts', numValue: 0, textValue: null, note: null },
      { metricKey: 'comments', numValue: 0, textValue: null, note: null },
      { metricKey: 'contacts_added', numValue: 0, textValue: null, note: null },
      { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
    ],
    attachments: [],
    dueTasks: [],
    missingDaysInWindow: [],
    today: '2026-10-02',
    withinBackfill: true,
    fourWeekAverage: {},
    spikeMultiplier: 3,
    spikeMinAverage: 5,
    ...over,
  };
}

describe('check 1 · the entry must be editable', () => {
  it('passes a complete draft', () => {
    expect(checkDaily(input())).toEqual({ ok: true, errors: [] });
  });

  it('allows an unlocked entry', () => {
    expect(checkDaily(input({ status: 'unlocked' })).ok).toBe(true);
  });

  it('refuses a submitted entry with one message', () => {
    expect(checkDaily(input({ status: 'submitted' }))).toEqual({
      ok: false,
      errors: [msg.locked],
    });
  });
});

describe('check 2 · every enabled field needs a value', () => {
  it('accepts 0', () => {
    expect(checkDaily(input()).ok).toBe(true);
  });

  it('refuses a blank', () => {
    const result = checkDaily(
      input({
        values: [
          { metricKey: 'posts', numValue: null, textValue: null, note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Posts published: enter a number (0 is fine)');
  });

  it('refuses a missing row altogether', () => {
    expect(checkDaily(input({ values: [] })).errors).toHaveLength(4);
  });
});

describe('check 3 · whole numbers only', () => {
  it('refuses a fraction', () => {
    const result = checkDaily(
      input({
        values: [
          { metricKey: 'posts', numValue: 1.5, textValue: 'https://x.co/p', note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );
    expect(result.errors).toContain('Posts published: enter a whole number, 0 or more');
  });
});

describe('check 4 · file proof above 0', () => {
  const withComments = (attachments: DailyCheckInput['attachments']) =>
    checkDaily(
      input({
        attachments,
        values: [
          { metricKey: 'posts', numValue: 0, textValue: null, note: null },
          { metricKey: 'comments', numValue: 5, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );

  it('refuses when nothing is attached', () => {
    expect(withComments([]).errors).toContain('Comments made: attach a screenshot');
  });

  it('passes with a screenshot', () => {
    expect(
      withComments([
        { id: 'a', metricKey: 'comments', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 10 },
      ]).ok,
    ).toBe(true);
  });

  it('does not ask for proof at 0', () => {
    expect(checkDaily(input()).ok).toBe(true);
  });
});

describe('check 5 · link proof above 0', () => {
  const withPosts = (textValue: string | null) =>
    checkDaily(
      input({
        values: [
          { metricKey: 'posts', numValue: 2, textValue, note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );

  it('refuses a missing link', () => {
    expect(withPosts(null).errors).toContain('Posts published: add a link');
  });

  it('refuses a link that is not https', () => {
    expect(withPosts('http://example.test/post').errors).toContain('Posts published: add a link');
  });

  it('accepts an https link', () => {
    expect(withPosts('https://example.test/post').ok).toBe(true);
  });
});

describe('check 6 · filtered contacts cannot exceed contacts added', () => {
  const withContacts = (added: number, filtered: number) =>
    checkDaily(
      input({
        values: [
          { metricKey: 'posts', numValue: 0, textValue: null, note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: added, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: filtered, textValue: null, note: null },
        ],
      }),
    );

  it('refuses more filtered than added', () => {
    expect(withContacts(10, 20).errors).toContain(msg.filteredOverAdded);
  });

  it('allows the same number', () => {
    expect(withContacts(10, 10).ok).toBe(true);
  });

  it('allows fewer', () => {
    expect(withContacts(10, 8).ok).toBe(true);
  });
});

describe('check 7 · a spike needs a note', () => {
  const spike = (numValue: number, note: string | null) =>
    checkDaily(
      input({
        fourWeekAverage: { contacts_added: 10 },
        values: [
          { metricKey: 'posts', numValue: 0, textValue: null, note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue, textValue: null, note },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );

  it('asks for a note above three times the average', () => {
    expect(spike(31, null).errors).toContain(
      'Contacts added is much higher than usual. Add a note.',
    );
  });

  it('is satisfied by a note', () => {
    expect(spike(31, 'Imported a conference list').ok).toBe(true);
  });

  it('allows exactly three times the average', () => {
    expect(spike(30, null).ok).toBe(true);
  });

  it('ignores the rule when the average is under 5', () => {
    const result = checkDaily(
      input({
        fourWeekAverage: { contacts_added: 4 },
        values: [
          { metricKey: 'posts', numValue: 0, textValue: null, note: null },
          { metricKey: 'comments', numValue: 0, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 100, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 0, textValue: null, note: null },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('check 8 · open tasks due that day need an update', () => {
  it('refuses when a due task has no update', () => {
    const result = checkDaily(
      input({
        dueTasks: [
          {
            id: 't1',
            title: 'Clean the list',
            dueDate: '2026-10-01',
            status: 'In progress',
            hasUpdateForDay: false,
          },
        ],
      }),
    );
    expect(result.errors).toContain('Task status: Clean the list');
  });

  it('passes once the task has an update', () => {
    const result = checkDaily(
      input({
        dueTasks: [
          {
            id: 't1',
            title: 'Clean the list',
            dueDate: '2026-10-01',
            status: 'In progress',
            hasUpdateForDay: true,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('ignores tasks not yet due', () => {
    const result = checkDaily(
      input({
        dueTasks: [
          {
            id: 't1',
            title: 'Later',
            dueDate: '2026-10-09',
            status: 'Not started',
            hasUpdateForDay: false,
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('check 9 · a missed day blocks today', () => {
  it('names each missing day in the database wording', () => {
    const result = checkDaily(
      input({ missingDaysInWindow: ['2026-09-30', '2026-10-01'] }),
    );
    expect(result.errors).toEqual(['Submit Wed 30 Sep first', 'Submit Thu 01 Oct first']);
  });

  it('only applies to today', () => {
    const result = checkDaily(
      input({
        periodStart: '2026-10-01',
        today: '2026-10-02',
        missingDaysInWindow: ['2026-09-30'],
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('check 10 · the backfill window', () => {
  it('refuses a past day outside the window', () => {
    const result = checkDaily(
      input({ periodStart: '2026-09-20', today: '2026-10-02', withinBackfill: false }),
    );
    expect(result.errors).toContain(msg.tooLateToBackfill);
  });

  it('allows it once an admin has unlocked it', () => {
    const result = checkDaily(
      input({
        periodStart: '2026-09-20',
        today: '2026-10-02',
        withinBackfill: false,
        status: 'unlocked',
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe('all failures come back together', () => {
  it('lists every problem at once, as submit_entry does', () => {
    const result = checkDaily(
      input({
        values: [
          { metricKey: 'posts', numValue: 2, textValue: null, note: null },
          { metricKey: 'comments', numValue: 5, textValue: null, note: null },
          { metricKey: 'contacts_added', numValue: 10, textValue: null, note: null },
          { metricKey: 'contacts_filtered', numValue: 20, textValue: null, note: null },
        ],
      }),
    );
    expect(result.errors).toEqual([
      'Posts published: add a link',
      'Comments made: attach a screenshot',
      'Filtered contacts cannot be more than contacts added',
    ]);
  });
});

describe('dailyProgress', () => {
  it('counts answered fields', () => {
    expect(dailyProgress(input())).toEqual({ done: 4, total: 4, missing: [] });
  });

  it('names what is still needed', () => {
    const p = dailyProgress(input({ values: [] }));
    expect(p.done).toBe(0);
    expect(p.missing).toEqual([
      'Posts published',
      'Comments made',
      'Contacts added',
      'Contacts filtered (qualified)',
    ]);
  });
});
