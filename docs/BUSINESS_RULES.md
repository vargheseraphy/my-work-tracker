# Business rules

These rules are enforced in the database (db/migrations/0002 and 0005). The web app repeats them
only for instant feedback, using the same wording. If this file and the SQL ever disagree, the SQL
is what runs; record the difference in docs/BLOCKERS.md.

## Working days and dates
- A working day is a weekday in the person's `work_days` (default Monday to Friday) that is not a
  holiday for everyone and not leave for that person, on or after their `start_date`.
- "Today" is in the person's time zone (default `Asia/Kolkata`). Always ask the database
  (`local_today(user)`), never the browser clock.
- A week runs Monday to Friday and is identified by its Monday.

## Daily sign-off (`submit_entry`)
All failures are returned together as a list.

| # | Check | Message |
| --- | --- | --- |
| 1 | Entry belongs to the caller and is draft or unlocked | This entry is locked |
| 2 | Every enabled daily field has a value | {Field}: enter a number (0 is fine) |
| 3 | Whole numbers, 0 or more | {Field}: enter a whole number, 0 or more |
| 4 | File-proof field above 0 has an attachment | {Field}: attach a screenshot |
| 5 | Link-proof field above 0 has a link starting https:// | {Field}: add a link |
| 6 | Contacts filtered ≤ contacts added | Filtered contacts cannot be more than contacts added |
| 7 | Value over 3× the 4-week average (when the average is 5 or more) has a note | {Field} is much higher than usual. Add a note. |
| 8 | Each open task assigned to the caller and due on or before the day has an update dated on or after that day | Task status: {title} |
| 9 | Today's entry: no missing working days inside the backfill window | Submit {Dy DD Mon} first |
| 10 | Past entry: inside the backfill window (2 working days), unless unlocked by an admin | Too late to backfill. Ask your admin to unlock. |

Opening an entry (`open_entry`) also refuses future days, non-working days, and past days outside
the window ("Too late to backfill. Ask your admin to unlock.").

### Status
- **submitted**: on the day, by the deadline (default 19:00 local).
- **late**: after the deadline or on a later day. `is_late` stays true after unlock and resubmit.
- **missing**: not stored. A past working day with no submitted or late entry.
- **unlocked**: set only by an admin with a reason; the person edits and submits again; the audit
  log keeps the old values.

## Weekly sign-off
- Opens Friday 16:00 local, due Monday 12:00 local; late after that.
- Auto totals (accounts added, emails, replies, posts) come from submitted and late daily entries and
  are frozen into `entries.auto_totals` on submit.
- Required when enabled for the person: calls, meetings, open rate (0 to 100) with screenshot,
  impressions with screenshot, followers, website form responses, company names when responses are
  above 0, Google Analytics upload, users, sessions, top page, three reflections (max 500 characters).
- Search activities: at least one row, or "none this week".
- ABM: at least one account picked if the person owns an account at Live, Engaged or Meeting booked.
- Cannot be submitted while that week has missing daily logs.

## Reminder rules (`queue_due_reminders`)
| Key | Fires when | Default time | Goes to |
| --- | --- | --- | --- |
| daily_not_started | Working day, no values entered today | 17:00 | Contributor |
| daily_deadline | Working day, today not submitted | 19:00 | Contributor |
| day_missed | Previous working day missing | 10:00 | Contributor |
| two_days_missed | Last two working days missing | 10:00 | Contributor and admins |
| weekly_open | Friday, this week's log not submitted | 16:00 | Contributor |
| weekly_overdue | Monday, last week's log not submitted | 12:00 | Contributor and admins |
| task_due_soon | Open task due tomorrow | 10:00 | Assignee |
| task_due_today | Open task due today | 10:00 | Assignee |
| task_overdue | Open task past due | 10:00 daily | Assignee; admins from 3 working days overdue |
| abm_not_planned | Monday, no ABM account planned this week | 10:00 | Admins |
| abm_not_live | Thursday, this week's account still at Research or Assets ready | 10:00 | Admins and the owner |
| monday_summary | Monday | 09:00 | Admins |

- A rule can fire from its time until 3 hours later (so a computer that was asleep catches up).
- Each reminder is recorded once per person, rule, day and subject (unique key), so it is never sent twice.
- `entry_unlocked` notifications are created by `unlock_entry` and emailed by the same job.

## Tasks
- Statuses: Not started, In progress, Blocked, Done, Cancelled. Only admins cancel.
- Blocked needs a note. Done needs a link or a file. Done sets `completed_at`.
- Overdue: open and due before the assignee's today.

## ABM
- Plan: one new account live per week. A week hits when its planned account is Live or later by Friday.
- A past week with no account planned shows as missed.
- Owners can move their own account's stage, notes, links and touches; only admins change name,
  vertical, region, owner or week.

## Targets and pace
- Targets are weekly, per person, per measure (`user_metric_settings.weekly_target`).
- Pace share = working days completed this week ÷ working days in the week (Tuesday evening of a
  5-day week: 2 ÷ 5 = 0.4).
- Ratio = actual ÷ (target × pace share). Green ≥ 1.0; amber 0.75 to under 1.0; red under 0.75.
  Show the word (on pace, close, behind) as well as the colour.
