/**
 * Client-side mirror of the weekly sign-off checks in public.submit_entry().
 * Instant feedback only: the server response always wins.
 * Rules from docs/BUSINESS_RULES.md "Weekly sign-off".
 */

import type { CheckResult, EntryValue, WeeklyCheckInput } from './types.js';
import { msg } from './messages.js';

export function checkWeekly(input: WeeklyCheckInput): CheckResult {
  const errors: string[] = [];

  if (input.status !== 'draft' && input.status !== 'unlocked') {
    return { ok: false, errors: [msg.locked] };
  }

  const valueOf = (key: string): EntryValue | undefined =>
    input.values.find((v) => v.metricKey === key);
  const hasAttachment = (key: string): boolean =>
    input.attachments.some((a) => a.metricKey === key);

  const formResponses = valueOf('wk_forms')?.numValue ?? 0;

  for (const field of input.fields) {
    const value = valueOf(field.key);

    if (field.valueType === 'int' || field.valueType === 'percent') {
      if (value?.numValue === null || value?.numValue === undefined) {
        errors.push(msg.needNumber(field.label));
        continue;
      }
      if (field.valueType === 'int' && !Number.isInteger(value.numValue)) {
        errors.push(msg.needWholeNumber(field.label));
        continue;
      }
      if (field.valueType === 'percent' && value.numValue > 100) {
        errors.push(msg.needPercent(field.label));
        continue;
      }
      if (value.numValue > 0 && field.proof === 'file' && !hasAttachment(field.key)) {
        errors.push(msg.needScreenshot(field.label));
      }
      if (value.numValue > 0 && field.proof === 'link' && !/^https:\/\//.test(value.textValue ?? '')) {
        errors.push(msg.needLink(field.label));
      }
    } else if (field.valueType === 'text') {
      // Company names are only required when there was at least one form response.
      if (field.key === 'wk_form_companies' && formResponses === 0) continue;
      if ((value?.textValue ?? '').trim() === '') {
        errors.push(msg.needText(field.label));
      } else if ((value?.textValue ?? '').length > 500) {
        errors.push(msg.tooLong(field.label));
      }
    } else if (field.valueType === 'file') {
      if (!hasAttachment(field.key)) errors.push(msg.needUpload(field.label));
    } else if (field.valueType === 'list' && field.key === 'wk_search') {
      if (!input.noSearchActivity && input.searchActivities.length === 0) {
        errors.push(msg.searchActivities);
      }
    }
  }

  if (!input.isOpen) errors.push(msg.weeklyNotOpen);
  if (input.missingDaysThisWeek.length > 0) errors.push(msg.weeklyMissingDays);
  if (input.ownsActiveAbmAccount && input.pickedAbmAccountIds.length === 0) {
    errors.push(msg.abmPickOne);
  }

  return { ok: errors.length === 0, errors };
}

/** Which weekly fields still have no answer, for the "Still needed" panel. */
export function weeklyProgress(input: WeeklyCheckInput): {
  done: number;
  total: number;
  missing: string[];
} {
  const formResponses = input.values.find((v) => v.metricKey === 'wk_forms')?.numValue ?? 0;
  const missing: string[] = [];
  let total = 0;

  for (const field of input.fields) {
    if (field.key === 'wk_form_companies' && formResponses === 0) continue;
    total += 1;
    const value = input.values.find((v) => v.metricKey === field.key);
    let answered: boolean;
    if (field.key === 'wk_search') {
      answered = input.noSearchActivity || input.searchActivities.length > 0;
    } else if (field.valueType === 'file') {
      answered = input.attachments.some((a) => a.metricKey === field.key);
    } else if (field.valueType === 'text') {
      answered = (value?.textValue ?? '').trim() !== '';
    } else {
      answered = value?.numValue !== null && value?.numValue !== undefined;
    }
    if (!answered) missing.push(field.label);
  }

  return { done: total - missing.length, total, missing };
}
