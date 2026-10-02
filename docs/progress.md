# Build progress

Claude updates this file at the end of every phase. Status: Not started, In progress, Partly done, Done.

| Phase | Status | What was built | Tests (passed / total) | Commit |
| --- | --- | --- | --- | --- |
| 0 Preflight | Done | Homebrew PostgreSQL 16.15 and Mailpit running; `gtm`, `gtm_test` and `gtm_verify` created and migrated; `.env` written with generated secrets; `gtm_app` login set | 15 / 15 database checks | `P0: preflight, database migrated and verified` |
| 1 Monorepo and tooling | Done | npm workspaces, shared package, server and web skeletons, migration runner, seed, scripts, ESLint and Vitest | 68 / 68 shared | `P1: ...` |
| 2 Server core and auth | Done | withUser and asApp, argon2 sign in, sessions, lockout, invites, resets, CSRF, security headers, role guards | 30 / 30 auth | `P2: ...` |
| 3 Server features | Done | Entries, files, tasks, ABM, notifications, admin, dashboard, person detail, settings, calendar, users, report, CSV | 121 / 121 rules, access and routes | `P3: ...` |
| 4 Email and jobs | Done | Branded email layout, SMTP transport, reminder job, Monday report job, node-cron scheduler | 9 / 9 against Mailpit | `P4: ...` |
| 5 Web shell and components | Not started | | | |
| 6 Contributor screens | Not started | | | |
| 7 Manager screens | Not started | | | |
| 8 Finish and verify | Not started | | | |

## Last `npm run verify`
Shared and server suites: 228 passed, 0 failed (10 files). Lint, types, and browser journeys still to run.

## Local accounts
Invented test logins created by the seed. Local only. Not real people.

| Role | Email | Password |
| --- | --- | --- |
| Raphy | raphy@example.test | amber-quartz-b73c |
| Tanzil | tanzil@example.test | summit-pebble-f3c2 |
| Anil | anil@example.test | lantern-harbour-8ca7 |
| Tamre | tamre@example.test | pebble-meadow-f5ce |
| Leadership | viewer@example.test | summit-meadow-15b7 |

## Open items
None yet.

## How to run

Docker is not installed on this machine, so the services run through Homebrew (see docs/BLOCKERS.md).

```bash
brew services start postgresql@16     # or: docker compose up -d
brew services start mailpit
npm install
npm run dev        # http://localhost:5173 , emails at http://localhost:8025
```

`psql` lives at `/opt/homebrew/opt/postgresql@16/bin`. Add it to your PATH to use it directly.
