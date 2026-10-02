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

## Tokens (copy into apps/web/src/styles/tokens.css)
```css
--bg:#F5F5F3; --surface:#FFFFFF; --surface-2:#FAFAF8; --border:#E4E4E0; --border-strong:#CFCFC9;
--text:#111111; --muted:#555555; --faint:#6E6E6E;
--gold:#D4A843; --gold-light:#F0C866;
--good:#2B6E45; --good-bg:#E7F2EB; --good-line:#B9DBC6;
--bad:#A83A28;  --bad-bg:#FBECE8;  --bad-line:#EDC2B8;
--warn:#7A5200; --warn-bg:#FFF3D6; --warn-line:#EBD49A;
--info:#34465A; --info-bg:#E9EEF3; --info-line:#C4D0DC;
--font:'Plus Jakarta Sans',system-ui,sans-serif; --mono:'DM Mono',ui-monospace,monospace;
```
Radius: 12 px cards, 9 px buttons, 8 px inputs, 5 px pills. Primary buttons are black (`--text`).
Gold is only for the 3 px top bar, the active menu marker, eyebrow rules and progress bars:
never text, never a fill behind text. Fonts load from Google Fonts; with no internet they fall back to system fonts.

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
