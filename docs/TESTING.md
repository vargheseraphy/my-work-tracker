# Testing

`npm run verify` runs everything below. A phase is not done until it passes.

| Layer | Tool | Database | Covers |
| --- | --- | --- | --- |
| Shared | Vitest | none | zod schemas, client rule mirror, pace and growth maths, date formatting |
| Database | Vitest + pg | gtm_test, reset per file | every rule in BUSINESS_RULES.md, every access rule below |
| Server | Vitest + fastify.inject | gtm_test | each route group for contributor, admin, viewer, anonymous |
| Jobs | Vitest + Mailpit API | gtm_test | one email per pending notification; none on a second run |
| Browser | Playwright (1440×900 and 390×844) | gtm with seed | journeys J1 to J12, axe accessibility on every screen |

Database tests: connect as gtm_app and use the same `withUser` helper as the server. Use invented
users with `work_days = {1..7}` where a test must not depend on the weekday. Times: tests that depend
on the deadline should set the person's `timezone` so that local time is clearly before or after 19:00.

## Access rules to test
- Contributor reads only own entries, values, attachments, tasks, task updates, notifications.
- Contributor reads all profiles, ABM accounts, metric definitions, calendar days, reminder rules, settings; writes none of them.
- Contributor cannot update status, is_late, submitted_at; cannot insert entries directly.
- Contributor cannot change ABM name, vertical, region, owner or week; can change stage on own accounts only.
- Viewer reads what admin reads except the audit log; writes nothing.
- Inactive user reads nothing and cannot sign in.
- Web role cannot read auth.* or call queue_due_reminders, pending_emails, mark_email.
- Catalogue test: every table in public has row-level security enabled (fails when a new table forgets it).
- Catalogue test: every SECURITY DEFINER function in public has a fixed search_path.

## Rule tests
- Each daily check 1 to 10 and each weekly check: one passing and one failing case.
- Weekends, holidays, leave, days before start date are never missing.
- Time zones: two people in Asia/Kolkata and Asia/Dubai get different "today" around midnight.
- Late after 19:00 local; `is_late` survives unlock and resubmit.
- Auto totals equal the sum of submitted and late daily entries only.
- Reminders fire inside the 3-hour window only, and once per person, rule, day and subject.

## Browser journeys
| ID | Journey |
| --- | --- |
| J1 | Contributor signs in, sees the missing-day banner, opens the missed day |
| J2 | Fills it with a screenshot and a link; submit enables; submits; day shows late |
| J3 | Today unlocks; filtered above added shows the error; fixing clears it |
| J4 | Refresh mid-form keeps values; after submit the form is read-only |
| J5 | Weekly log totals equal the daily entries; submit after all fields |
| J6 | Task to Blocked without a note fails; to Done with a link succeeds |
| J7 | Owner moves an ABM account to Live; the week strip shows Live |
| J8 | Admin dashboard grid shows the late day; targets show pace with words |
| J9 | Admin unlocks a day with a reason; contributor gets a notification and can edit |
| J10 | Admin creates a task; contributor sees it on home and in the daily log |
| J11 | Admin turns a field off for one person; it disappears from their next log |
| J12 | Admin marks a holiday; that day stops showing as missing |

## Seed data (local only, invented)
- Admin "Raphy" (`raphy@example.test`), contributors "Tanzil", "Anil", "Tamre"
  (`tanzil@example.test` and so on), viewer "Leadership" (`viewer@example.test`). Passwords random,
  printed once and written to docs/progress.md "Local accounts". Never use real email addresses.
- Four weeks of daily and weekly entries ending yesterday: mostly submitted, two late, one missing day
  for Tanzil within the backfill window.
- Eight tasks across people: one overdue and blocked, one due today, one done with proof.
- Six ABM accounts named [Account A] to [Account F] across stages, one week with no account.
- One public holiday in the past four weeks; one leave day for Anil.
- Weekly targets for every target measure.
