# Build progress

Claude updates this file at the end of every phase. Status: Not started, In progress, Partly done, Done.

| Phase | Status | What was built | Tests (passed / total) | Commit |
| --- | --- | --- | --- | --- |
| 0 Preflight | Done | Homebrew PostgreSQL 16.15 and Mailpit running; `gtm`, `gtm_test` and `gtm_verify` created and migrated; `.env` written with generated secrets; `gtm_app` login set | 15 / 15 database checks | `P0: preflight, database migrated and verified` |
| 1 Monorepo and tooling | Not started | | | |
| 2 Server core and auth | Not started | | | |
| 3 Server features | Not started | | | |
| 4 Email and jobs | Not started | | | |
| 5 Web shell and components | Not started | | | |
| 6 Contributor screens | Not started | | | |
| 7 Manager screens | Not started | | | |
| 8 Finish and verify | Not started | | | |

## Last `npm run verify`
Not run yet.

## Local accounts
Invented test logins created by the seed. Local only. Not real people.

| Role | Email | Password |
| --- | --- | --- |
| | | |

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
