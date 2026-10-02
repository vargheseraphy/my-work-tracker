import { describe, expect, it } from 'vitest';
import { completion, formatGrowth, formatNumber, growth, pace, targetShare } from './pace.js';

describe('pace', () => {
  it('uses the worked example from the business rules', () => {
    // Tuesday evening of a 5-day week: 2 / 5 = 0.4
    const p = pace(40, 100, 2, 5);
    expect(p.paceShare).toBeCloseTo(0.4);
    expect(p.expected).toBeCloseTo(40);
    expect(p.ratio).toBeCloseTo(1);
    expect(p.level).toBe('good');
    expect(p.word).toBe('On pace');
  });

  it('is green at or above 1.0', () => {
    expect(pace(50, 100, 2, 5).level).toBe('good');
    expect(pace(40, 100, 2, 5).level).toBe('good');
  });

  it('is amber from 0.75 to under 1.0', () => {
    expect(pace(30, 100, 2, 5).level).toBe('warn'); // 30 / 40 = 0.75
    expect(pace(39, 100, 2, 5).level).toBe('warn');
    expect(pace(30, 100, 2, 5).word).toBe('Close');
  });

  it('is red under 0.75', () => {
    expect(pace(29, 100, 2, 5).level).toBe('bad');
    expect(pace(0, 100, 2, 5).word).toBe('Behind');
  });

  it('says so when there is no target', () => {
    const p = pace(12, null, 2, 5);
    expect(p.level).toBe('none');
    expect(p.word).toBe('No target');
    expect(p.ratio).toBeNull();
  });

  it('never marks anyone behind before the week starts', () => {
    expect(pace(0, 100, 0, 5).level).toBe('good');
  });

  it('never goes above a full week', () => {
    expect(pace(100, 100, 7, 5).paceShare).toBe(1);
  });

  it('copes with a week that has no working days', () => {
    expect(pace(0, 100, 0, 0).paceShare).toBe(0);
  });
});

describe('targetShare', () => {
  it('is a share of the whole week, capped at 1', () => {
    expect(targetShare(50, 100)).toBe(0.5);
    expect(targetShare(150, 100)).toBe(1);
    expect(targetShare(10, null)).toBeNull();
  });
});

describe('growth', () => {
  it('reports an increase', () => {
    const g = growth(3128, 3000);
    expect(g.change).toBe(128);
    expect(g.percent).toBeCloseTo(0.042666, 4);
    expect(g.direction).toBe('up');
    expect(formatGrowth(g)).toBe('+128 (+4.3%)');
  });

  it('reports a fall', () => {
    const g = growth(2900, 3000);
    expect(g.direction).toBe('down');
    expect(formatGrowth(g)).toBe('-100 (-3.3%)');
  });

  it('reports no change', () => {
    expect(formatGrowth(growth(100, 100))).toBe('No change');
  });

  it('has no percentage when the previous week was zero', () => {
    const g = growth(50, 0);
    expect(g.percent).toBeNull();
    expect(formatGrowth(g)).toBe('+50');
  });

  it('says nothing when there is no previous week', () => {
    expect(formatGrowth(growth(50, null))).toBe('');
  });
});

describe('formatting', () => {
  it('separates thousands', () => {
    expect(formatNumber(1251)).toBe('1,251');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(null)).toBe('0');
  });

  it('works out completion', () => {
    expect(completion(3, 4)).toBe(75);
    expect(completion(0, 0)).toBe(0);
  });
});
