# Database

PostgreSQL 16, plain SQL. The same files run locally and on Neon.

## Migrations
| File | Creates |
| --- | --- |
| 0000_roles_and_auth.sql | Roles `authenticated` and `gtm_app`; schema `auth` with users, sessions, tokens; `auth.uid()` |
| 0001_schema.sql | 12 enum types and the 17 public tables with constraints and indexes |
| 0002_functions.sql | Helpers, rule functions, dashboard functions, 3 views, triggers (timestamps, locking, ABM owner limits, audit) |
| 0003_security.sql | Row-level security on every public table, grants, policies |
| 0004_reference_data.sql | App settings, 13 daily and 19 weekly metric definitions, 12 reminder rules |
| 0005_reminders.sql | `queue_due_reminders`, `pending_emails`, `mark_email` for the job runner |

Run them in name order, as the owner role, each in one transaction. Record applied files in
`public._migrations`. Never edit an applied file; add `0006_...sql` and onwards.

## Roles
| Role | Login | Used by | Can |
| --- | --- | --- | --- |
| owner (`gtm_owner` locally, `neondb_owner` on Neon) | yes | migrations only | everything; owns all objects |
| `gtm_app` | yes (password set in phase 0) | the server | auth tables, job functions; becomes `authenticated` per request |
| `authenticated` | no | every web request | only what the grants and RLS policies allow |

Row-level security is enabled but not forced. The owner, and the SECURITY DEFINER functions it owns,
pass through RLS on purpose: that is how the rule functions read across rows safely. It also works
on Neon, where the owner is not a superuser.

## Public tables
| # | Table | Holds | Web request can write |
| --- | --- | --- | --- |
| 1 | profiles | team members: name, role, timezone, work days, start date, active | admin only |
| 2 | app_settings | deadlines, backfill window, spike rule, report recipients | admin only |
| 3 | metric_definitions | every daily and weekly field | admin only |
| 4 | user_metric_settings | field on or off and weekly target per person | admin only |
| 5 | entries | one daily or weekly log per person per period, status | only `no_search_activity`; status through functions |
| 6 | entry_values | one answer per field | owner while draft or unlocked |
| 7 | tasks | backlog | admin; status via `update_task` |
| 8 | task_updates | status history | via `update_task` only |
| 9 | attachments | file records for entry fields or tasks | owner while editable |
| 10 | abm_accounts | ABM accounts | admin adds; owner updates stage, notes, links |
| 11 | abm_weekly_touches | emails, messages, calls per account per week | owner or admin |
| 12 | search_activities | SEO, AEO, GEO rows on a weekly log | owner while editable |
| 13 | entry_abm_accounts | accounts worked in a week | owner while editable |
| 14 | calendar_days | holidays (everyone) and leave (one person) | admin only |
| 15 | reminder_rules | the 12 reminder rules | admin only |
| 16 | notifications | in-app bell and email queue | mark as read only |
| 17 | audit_log | every change to key tables | never; admin reads |

## Functions
| Function | Called by | Purpose |
| --- | --- | --- |
| open_entry(type, period) | web | create or return an entry; working day and backfill checks |
| submit_entry(entry) | web | every sign-off rule; returns `{ok, status}` or `{ok:false, errors}` |
| unlock_entry(user, type, period, reason) | web, admin | unlock or open a missed day; notifies the person |
| update_task(task, status, note, proof_url) | web | status change with its rules and history |
| missing_days(user), within_backfill(user, day) | web | missed days and the window |
| week_auto_totals(user, monday) | web | weekly totals from daily logs |
| dashboard_compliance(month), dashboard_week(monday) | web, admin/viewer | dashboard data |
| local_today, local_now, week_monday, is_working_day, working_days_between, setting | helpers | dates and settings |
| is_active_user, is_admin, can_read_all, entry_editable, entry_visible | policies | access checks |
| queue_due_reminders(at), pending_emails(), mark_email(id, status) | jobs only | reminders and email queue |

Views (run with the caller's rights): `v_open_tasks`, `v_week_totals`, `v_abm_week_plan`.

## Metric keys (do not rename)
Daily: posts, comments, likes, dms, emails, templates, replies, accounts_found, accounts_added,
contacts_added, contacts_filtered, posters, newsletters.
Weekly: wk_accounts_added, wk_emails, wk_replies, wk_posts (automatic), wk_calls, wk_meetings,
wk_open_rate, wk_impressions, wk_followers, wk_forms, wk_form_companies, wk_ga_report, wk_ga_users,
wk_ga_sessions, wk_ga_top_page, wk_search, wk_reflect_worked, wk_reflect_not, wk_reflect_focus.
Target measures: posts, dms, emails, accounts_added, contacts_added, wk_calls, wk_meetings.

## Verified
db/verify holds 15 checks that were run on PostgreSQL 16 on 2 October 2026 with a non-superuser
owner (as on Neon). All passed. Expected results: db/verify/README.md.
