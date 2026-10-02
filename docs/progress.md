# Build progress

Claude updates this file at the end of every phase. Status: Not started, In progress, Partly done, Done.

| Phase | Status | What was built | Tests (passed / total) | Commit |
| --- | --- | --- | --- | --- |
| 0 Preflight | Done | Homebrew PostgreSQL 16.15 and Mailpit running; `gtm`, `gtm_test` and `gtm_verify` created and migrated; `.env` written with generated secrets; `gtm_app` login set | 15 / 15 database checks | `P0: preflight, database migrated and verified` |
| 1 Monorepo and tooling | Done | npm workspaces, the shared package, server and web skeletons, the migration runner, seed, `user:create`, `jobs:run-now`, ESLint, Vitest and Playwright | 80 / 80 shared | `P1: ...` |
| 2 Server core and auth | Done | `withUser` and `asApp`, argon2 sign-in, sessions, lockout, invites, resets, CSRF, security headers, role guards | 30 / 30 auth | `P2: ...` |
| 3 Server features | Done | Entries, files, tasks, ABM, notifications, admin, dashboard, person detail, settings, calendar, users, report and CSV | 109 / 109 rules, access and routes | `P3: ...` |
| 4 Email and jobs | Done | Branded email layout, SMTP transport, the reminder job, the Monday report job and the node-cron scheduler | 9 / 9 against Mailpit | `P4: ...` |
| 5 Web shell and components | Done | Tokens and styles from the prototypes, API client, auth context, app shell, notification bell, form fields with autosave, tables, compliance grid, impressions chart, drawers and modals | Covered by the browser journeys | `P5: ...` |
| 6 Contributor screens | Done | Home, daily log, weekly log, my tasks, ABM tracker | J1 to J7 pass | `P6: ...` |
| 7 Manager screens | Done | Dashboard, people, person detail, task management, targets and fields, holidays and leave, weekly report | J8 to J12 pass | `P7: ...` |
| 8 Finish and verify | Done | `npm run verify` green, axe clean on all 14 screens at both sizes, visual comparison captured, security checklist confirmed | 49 passed, 2 skipped (browser) | `P8: release candidate` |

## Last `npm run verify`

Run on 3 October 2026. Everything passed.

| Suite | Result |
| --- | --- |
| `npm run lint` | Clean, no warnings |
| `npm run typecheck` | Clean across shared, server, web, scripts and the browser tests |
| Shared (Vitest) | 80 passed |
| Server, database and jobs (Vitest) | 148 passed |
| Browser journeys (Playwright) | 49 passed, 2 skipped (the narrow-screen pair does not run at 1440 px) |
| Database checks (`npm run db:verify`) | 15 of 15 match db/verify/README.md |

The web bundle is 129 KB gzipped, against a budget of 300 KB.

## Local accounts
Invented test logins created by the seed. Local only. Not real people.

| Role | Email | Password |
| --- | --- | --- |
| Raphy | raphy@example.test | lantern-quartz-49d4 |
| Tanzil | tanzil@example.test | summit-summit-a244 |
| Anil | anil@example.test | quartz-summit-c647 |
| Tamre | tamre@example.test | meadow-amber-b3ca |
| Leadership | viewer@example.test | willow-willow-78b3 |

## Open items

Nothing blocks using the app. These are the things worth a decision when you have a moment.

| # | Item | Why it is open |
| --- | --- | --- |
| 1 | Confirm the commit email | The repository commits as `Raphy <raphy202@gmail.com>`. Change it with `git config user.email` if a work address is preferred. |
| 2 | Report recipients | The seed sets them to `raphy@example.test`. Put your real address in Settings before relying on the Monday email. |
| 3 | Real SMTP | Everything goes to Mailpit until the five `SMTP_*` values in `.env` are changed (docs/EMAIL.md). Nothing leaves this computer until then. |
| 4 | Backfill window | Still the planned default of 2 working days (`app_settings.backfill_working_days`). |
| 5 | Hosting | Reminders only go out while this computer is awake and `npm run dev` is running. docs/NEON_MIGRATION.md covers the move. |

## Visual comparison with the prototypes

`npx playwright test --project=desktop e2e/visual.spec.ts` writes each screen beside its
prototype into `test-results/visual/`. Differences that are there on purpose:

| Screen | Difference |
| --- | --- |
| Sign in | Email and password fields instead of the Google and Microsoft buttons (docs/DECISIONS.md). |
| Every screen | No "Sample data" chip and no "Switch to manager view" link; the menu follows the signed-in role (docs/DESIGN.md). |
| Dashboard | The compliance grid has its own month control, because a week can straddle a month end. The prototype showed one fixed month. |
| Dashboard, ABM | Numbers and names come from the database, so the shapes differ from the invented prototype data. |
| Daily log | A non-working day shows "Today is not a working day for you" rather than an error. The prototype had no such day. |
| Sidebar | Carries a notification bell and a Sign out button, which the prototype did not need. |

## How to run

Docker is not installed on this machine, so the services run through Homebrew (see docs/BLOCKERS.md).

```bash
brew services start postgresql@16     # or: docker compose up -d
brew services start mailpit
npm install
npm run dev        # http://localhost:5173 , emails at http://localhost:8025
```

`psql` lives at `/opt/homebrew/opt/postgresql@16/bin`. Add it to your PATH to use it directly.
