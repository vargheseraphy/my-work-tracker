/**
 * Client-side mirror of the daily sign-off checks in public.submit_entry().
 * Used only for instant feedback in the browser: the server response always wins.
 * Checks and wording follow docs/BUSINESS_RULES.md "Daily sign-off" in the same order.
 */

import { formatDayShort } from '../dates.js';
import type { CheckResult, DailyCheckInput, EntryValue } from './types.js';
import { msg } from './messages.js';

export function checkDaily(input: DailyCheckInput): CheckResult {
  const errors: string[] = [];

  // 1 · the entry must still be editable
  if (input.status !== 'draft' && input.status !== 'unlocked') {
    return { ok: false, errors: [msg.locked] };
  }

  const valueOf = (key: string): EntryValue | undefined =>
    input.values.find((v) => v.metricKey === key);
  const hasAttachment = (key: string): boolean =>
    input.attachments.some((a) => a.metricKey === key);

  for (const field of input.fields) {
    const value = valueOf(field.key);

    if (field.valueType === 'int' || field.valueType === 'percent') {
      // 2 · every enabled field has a value; 0 is fine, blank is not
      if (value?.numValue === null || value?.numValue === undefined) {
        errors.push(msg.needNumber(field.label));
        continue;
      }
      // 3 · whole numbers, 0 or more
      if (field.valueType === 'int' && !Number.isInteger(value.numValue)) {
        errors.push(msg.needWholeNumber(field.label));
        continue;
      }
      if (field.valueType === 'percent' && value.numValue > 100) {
        errors.push(msg.needPercent(field.label));
        continue;
      }
      // 4 · file proof when above 0
      if (value.numValue > 0 && field.proof === 'file' && !hasAttachment(field.key)) {
        errors.push(msg.needScreenshot(field.label));
      }
      // 5 · link proof when above 0
      if (value.numValue > 0 && field.proof === 'link' && !/^https:\/\//.test(value.textValue ?? '')) {
        errors.push(msg.needLink(field.label));
      }
      // 7 · a value well above the four-week average needs a note
      const average = input.fourWeekAverage[field.key] ?? 0;
      if (
        average >= input.spikeMinAverage &&
        value.numValue > input.spikeMultiplier * average &&
        (value.note ?? '').trim() === ''
      ) {
        errors.push(msg.needNote(field.label));
      }
    } else if (field.valueType === 'text') {
      if ((value?.textValue ?? '').trim() === '') {
        errors.push(msg.needText(field.label));
      } else if ((value?.textValue ?? '').length > 500) {
        errors.push(msg.tooLong(field.label));
      }
    } else if (field.valueType === 'file') {
      if (!hasAttachment(field.key)) errors.push(msg.needUpload(field.label));
    }
  }

  // 6 · contacts filtered cannot be more than contacts added
  const filtered = valueOf('contacts_filtered')?.numValue;
  const added = valueOf('contacts_added')?.numValue;
  if (filtered !== null && filtered !== undefined && added !== null && added !== undefined) {
    if (filtered > added) errors.push(msg.filteredOverAdded);
  }

  // 8 · every open task due on or before this day needs an update
  for (const task of input.dueTasks) {
    if (task.dueDate <= input.periodStart && !task.hasUpdateForDay) {
      errors.push(msg.taskStatus(task.title));
    }
  }

  // 9 and 10 · order and the backfill window
  if (input.periodStart === input.today) {
    for (const day of input.missingDaysInWindow) {
      errors.push(msg.submitDayFirst(formatDayShort(day)));
    }
  } else if (input.status !== 'unlocked' && !input.withinBackfill) {
    errors.push(msg.tooLateToBackfill);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * The "Still needed" panel on the daily log: which enabled fields have no answer yet.
 * Counts answers, not rule failures, so the progress bar moves as the person types.
 */
export function dailyProgress(input: Pick<DailyCheckInput, 'fields' | 'values'>): {
  done: number;
  total: number;
  missing: string[];
} {
  const missing: string[] = [];
  for (const field of input.fields) {
    const value = input.values.find((v) => v.metricKey === field.key);
    const answered =
      field.valueType === 'text'
        ? (value?.textValue ?? '').trim() !== ''
        : value?.numValue !== null && value?.numValue !== undefined;
    if (!answered) missing.push(field.label);
  }
  return { done: input.fields.length - missing.length, total: input.fields.length, missing };
}
