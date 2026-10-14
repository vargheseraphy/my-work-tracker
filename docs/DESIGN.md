# Design guide

The 13 files in `design/` are the visual source of truth. Open `design/index.html` in a browser to
click through them. They use invented sample data; the built app uses live data.

## Screens to routes
| # | Screen | Design file | Route | Role |
| --- | --- | --- | --- | --- |
| 1 | Sign in | signin.html | /signin, /set-password, /forgot, /reset | public |
| 2 | Contributor home | home.html | / | contributor |
| 3 | Daily log | daily-log.html | /daily/:date? | contributor |
| 4 | Weekly log | weekly-log.html | /weekly/:monday? | contributor |
| 5 | My tasks | my-tasks.html | /tasks, /tasks/:id | contributor |
| 6 | ABM tracker | abm-tracker.html | /abm | all |
| 7 | Dashboard | dashboard.html | /admin | admin, viewer |
| 8 | Person detail | person.html | /people/:id | admin, viewer |
| 9 | Task management | task-management.html | /admin/tasks | admin |
| 10 | Targets and fields | settings.html | /admin/settings | admin |
| 11 | Holidays and leave | calendar.html | /admin/calendar | admin |
| 12 | Weekly report | weekly-report.html | /report/:monday | admin, viewer |

Differences from the prototypes, on purpose:
- Sign in uses email and password fields (Google and Microsoft come later).
- The "Prototype only: fill sample values" buttons and "Sample data" labels are not built.
- The "Switch to manager view" link is not built; the menu follows the signed-in role.

## Tokens

The Repotra brand tokens live in `apps/web/src/styles/tokens.css` and are specified in
`design/brand-theme/my-report-tracker-brand-manual.md`, which is the source of truth. Light and
dark are both defined. Do not copy colour values into component CSS; read the token.

Names follow the manual: `--ink`, `--ink-2`, `--muted` for text; `--accent` for the one main
action and the focus ring; `--line` for hairlines; `--c1` to `--c6` for chart categories;
`--orb-*` for background and glass only. The older names (`--text`, `--gold`, `--border`,
`--radius`) still resolve as aliases so existing rules keep working, but do not add new uses.

Radius: 4 px buttons, inputs and chips; 10 px cards; 14 px glass. Nothing is a pill, avatars
only are round. Primary buttons are ink fill with canvas text. Accent appears once per view.
Fonts load from Google Fonts; with no internet they fall back to Segoe UI and system faces.

## Components
AppShell, Sidebar (role-aware, badges), PageHead (eyebrow + title + actions), Card, StatCard,
Banner (bad, good, warn, info), Pill, PaceDot (dot plus word), Button (primary, default, ghost,
dashed, ok), NumberField (autosave state: saving, saved, not saved), ProofSlot (attach, attached,
link), ProgressAside (count, bar, still needed, submit), DayTabs, Segmented, Drawer, Modal, Toast,
DataTable, ComplianceGrid, NotificationBell, ImpressionsChart (inline SVG).

## Behaviour
- Autosave each field after 600 ms; show saved state; retry 3 times; keep unsaved values in session storage.
- Drawers and modals trap focus, close on Escape, return focus to the opener.
- Under 900 px the sidebar becomes a top bar and form rows wrap; the progress panel moves below the form.
- Status always has words as well as colour (Submitted, Late, Missing, On pace, Behind).
