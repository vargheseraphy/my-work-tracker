# Database checks

Run on a throwaway database (for example `gtm_verify`) after applying all migrations:

```bash
psql "<owner url>/gtm_verify"   -f db/verify/01_setup_as_owner.sql
psql "<gtm_app url>/gtm_verify" -f db/verify/02_checks_as_app.sql
```

The setup creates invented users with every day as a working day, so results do not depend on the
day of the week. Some lines are expected errors: that is the database refusing something it should refuse.

| # | Check | Expected |
| --- | --- | --- |
| 1 | Submit an empty daily entry | ok false, 15 errors |
| 2 | Missing days block today | "Submit {yesterday} first", "Submit {day before} first" |
| 3 | Open a day outside the window | ERROR: Too late to backfill. Ask your admin to unlock. |
| 4 | Fill and submit the two backfill days | both `{"ok": true, "status": "late"}` |
| 5 | Filtered above added, screenshot missing | both messages listed |
| 6 | Fix and submit today | ok true; status `submitted` before 19:00 India time, `late` after |
| 7 | Change values or status after submit | ERROR permission denied for table entries (twice); the value update before them changes nothing |
| 8 | Contributor reads teammate entries and audit log | 0 and 0 |
| 9 | Contributor unlocks, creates a task | ERROR not allowed; ERROR new row violates row-level security policy for table "tasks" |
| 10 | Admin sees all, unlocks, reads audit | 4 entries; unlocked with reason; audit rows above 0 |
| 11 | Task Done without proof, then In progress | ERROR Add a link or attach a file before marking this Done; then In progress |
| 12 | Compliance as contributor, then admin | 0 rows; then rows by status |
| 13 | Reminder job as gtm_app | rows for entry_unlocked and task reminders; a second run adds none |
| 14 | Email queue as gtm_app | pending rows with email_on true |
| 15 | Web role reads auth.sessions, calls pending_emails | ERROR permission denied (both) |

Line 13 also shows "permission denied for function queue_due_reminders" for the web role at the
end. That is expected.
