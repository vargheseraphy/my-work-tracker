/**
 * Every sign-off message, word for word as public.submit_entry() raises it
 * (db/migrations/0002_functions.sql). The web app shows these for instant feedback; the server
 * response always wins. If the SQL changes, change these in the same commit.
 */

export const msg = {
  locked: 'This entry is locked',

  needNumber: (label: string) => `${label}: enter a number (0 is fine)`,
  needWholeNumber: (label: string) => `${label}: enter a whole number, 0 or more`,
  needPercent: (label: string) => `${label}: enter 0 to 100`,
  needScreenshot: (label: string) => `${label}: attach a screenshot`,
  needLink: (label: string) => `${label}: add a link`,
  needNote: (label: string) => `${label} is much higher than usual. Add a note.`,
  needText: (label: string) => `${label}: required`,
  tooLong: (label: string) => `${label}: keep it under 500 characters`,
  needUpload: (label: string) => `${label}: upload it`,

  filteredOverAdded: 'Filtered contacts cannot be more than contacts added',
  taskStatus: (title: string) => `Task status: ${title}`,
  submitDayFirst: (dayShort: string) => `Submit ${dayShort} first`,
  tooLateToBackfill: 'Too late to backfill. Ask your admin to unlock.',

  searchActivities: 'Search activities: add one, or tick none this week',
  weeklyNotOpen: 'The weekly log opens on Friday at 16:00',
  weeklyMissingDays: 'Submit the missing daily logs for this week first',
  abmPickOne: 'ABM: pick at least one account',
} as const;

/** Messages raised by public.open_entry(). */
export const openMsg = {
  futureDay: 'You cannot log a future day',
  notWorkingDay: 'That day is not a working day',
  tooLateToBackfill: msg.tooLateToBackfill,
  weeklyNotMonday: 'A weekly log starts on a Monday',
  futureWeek: 'You cannot log a future week',
} as const;

/** Messages raised by public.update_task(). */
export const taskMsg = {
  onlyAdminCancels: 'Only an admin can cancel a task',
  blockedNeedsNote: 'Say what is blocking you',
  doneNeedsProof: 'Add a link or attach a file before marking this Done',
} as const;
