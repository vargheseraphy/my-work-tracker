# Product requirements · Yallo GTM Tracker

Owner: Raphy, GTM. Version 2.0, 2 October 2026. Standalone GTM tool (decided 29 September 2026).

## Summary
A small internal web app where Tanzil, Anil and Tamre log their GTM activity every working day and
every week, cannot sign off until every required field is filled with proof, and are reminded
automatically when they miss a day or a backlog task. Raphy gets a live dashboard and a Monday
report instead of chasing people.

## Problem
The current spreadsheet shows it. April had 20 working days:

| April measure | Total | Days logged (of 20) |
| --- | --- | --- |
| Likes | 1,251 | 20 |
| Comments | 788 | 20 |
| Contacts added | 1,214 | 12 |
| New accounts | 87 | 13 |
| Emails sent | 171 | 6 |
| LinkedIn messages | 5 | 1 |

- Consistency is lost: outreach rows are blank most days, so nobody can tell if work did not happen or was not recorded.
- Effort skews to low-value activity: likes and comments daily; emails and messages, which create replies and meetings, on a handful of days.
- Raphy has to remind people by hand and has no single view of the week.
- Backlog tasks live outside the sheet and are forgotten.

## Users and roles
| Role | Who | Can do |
| --- | --- | --- |
| Admin | Raphy | Targets, fields per person, tasks, ABM accounts, holidays and leave, unlock entries, invite and deactivate, every dashboard and report |
| Contributor | Tanzil, Anil, Tamre | Own daily and weekly logs with proof, own tasks, own ABM accounts' stage and touches, own progress |
| Viewer (later) | Leadership | Read-only dashboard and report |

## Goals
| Goal | Measure | Target |
| --- | --- | --- |
| Consistency | Working days with a submitted daily log, per person | 100% by week 4 |
| Completeness | Weekly logs submitted by Monday 12:00 | 100% |
| Less chasing | Manual reminders Raphy sends | Zero by week 4 |
| Focus on output | Share of targets met for emails, messages, new accounts | Set after 4 weeks of data |
| ABM discipline | New ABM accounts live | 1 per week |
| Backlog control | Overdue tasks | Under 10% of open tasks |
| Pipeline | Meetings booked and replies | Shown beside activity every week |

## Daily log fields
| Group | Field | Proof when above 0 |
| --- | --- | --- |
| LinkedIn | Posts published | Link |
| LinkedIn | Comments made | Screenshot |
| LinkedIn | Likes given | None |
| LinkedIn | Direct messages sent | Screenshot |
| Email | Emails sent | Screenshot from the email tool |
| Email | Accumba mail templates created | Link |
| Email | Replies received | None |
| Accounts | New accounts found | None |
| Accounts | New accounts added to CRM | None |
| Accounts | Contacts added | None |
| Accounts | Contacts filtered (qualified) | None; cannot exceed contacts added |
| Content | Posters created | Upload |
| Content | Newsletter campaigns launched | Link |
| Tasks | Status of each open task due today or earlier | Note for Blocked, proof for Done |
| Notes | Blockers or comments | Optional |

## Weekly log fields
| Group | Field | Source |
| --- | --- | --- |
| Outreach | Accounts added, emails sent, replies | Automatic from daily logs |
| Outreach | Calls made, meetings booked | Entered |
| Outreach | Email open rate (%) | Entered with screenshot |
| Social | Posts | Automatic |
| Social | Impressions | Entered with screenshot |
| Social | Followers at week end | Entered; growth calculated |
| Website | Form responses and company names | Entered |
| Website | Google Analytics weekly report; users, sessions, top page | Upload and entered |
| Search | SEO, AEO, GEO activities | Rows: type, what, link; or "none this week" |
| ABM | Accounts worked this week | Picked from the tracker |
| Reflection | What worked, what did not, focus next week | Text |

Raphy decides per person which fields apply (for example, only one person owns website and Google Analytics).

## ABM tracker
One new ABM account live every week. Each account has name, vertical (Yallo Talent, saasinator AI,
Yallo AI Academy), region, owner, planned week, stage (Research, Assets ready, Live, Engaged,
Meeting booked, Closed), weekly touches (emails, messages, calls), notes and links.

## Backlog tasks
Raphy assigns one-off work with title, details, assignee, due date and priority. Statuses: Not
started, In progress, Blocked, Done, Cancelled. History is kept. Open tasks show on home and in the
daily log.

## Sign-off and reminders
Full rules: docs/BUSINESS_RULES.md. In short: no blanks, proof when above 0, a missed day blocks
today, 2-day backfill marked late, locked after submit, admin unlock with a reason, reminders by
email and in-app at set times in each person's time zone.

## Dashboard and reports
- Compliance grid (person by day), week against target with pace, outcomes week on week,
  impressions trend, ABM, backlog, search activity.
- Person detail with proof and unlock.
- Monday report by email and as a printable page; monthly CSV in the old spreadsheet layout.

## Screens
| # | Screen | Design file | Role |
| --- | --- | --- | --- |
| 1 | Sign in | design/signin.html (use email and password fields) | All |
| 2 | Contributor home | design/home.html | Contributor |
| 3 | Daily log | design/daily-log.html | Contributor |
| 4 | Weekly log | design/weekly-log.html | Contributor |
| 5 | My tasks | design/my-tasks.html | Contributor |
| 6 | ABM tracker | design/abm-tracker.html | All |
| 7 | Manager dashboard | design/dashboard.html | Admin, viewer |
| 8 | Person detail | design/person.html | Admin, viewer |
| 9 | Task management | design/task-management.html | Admin |
| 10 | Targets and fields | design/settings.html | Admin |
| 11 | Holidays and leave | design/calendar.html | Admin |
| 12 | Weekly report | design/weekly-report.html | Admin, viewer |

## Out of scope for this build
Google and Microsoft sign-in, Apollo import, chat reminders, hosting. These follow once the app runs
locally and moves to Neon (docs/NEON_MIGRATION.md).
