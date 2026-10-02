# Local setup

## With Docker (recommended)
```bash
docker compose up -d          # PostgreSQL 16 on :5432 and Mailpit on :1025 / :8025
docker compose ps             # postgres should say healthy
```
The owner login is `gtm_owner` / `gtm_owner_local_only` (local only, also in `.env.example`).

## Without Docker (macOS, Homebrew)
```bash
brew install postgresql@16 mailpit
brew services start postgresql@16
brew services start mailpit
/opt/homebrew/opt/postgresql@16/bin/psql postgres -c "create role gtm_owner login createrole password 'gtm_owner_local_only'"
/opt/homebrew/opt/postgresql@16/bin/psql postgres -c "create database gtm owner gtm_owner"
```
Then use the same `.env` values. Mailpit's inbox is still http://localhost:8025.

## Fresh start (local only, deletes local data)
```bash
npm run db:reset              # drops and recreates gtm, migrates, seeds invented data
```

## Ports
| Port | Service |
| --- | --- |
| 5173 | Web app (Vite) |
| 3000 | API server |
| 5432 | PostgreSQL |
| 1025 | Mailpit SMTP |
| 8025 | Mailpit inbox |

## Keep the Mac awake for the overnight build
```bash
caffeinate -dims
```
Leave it running in its own Terminal window, keep the charger in and the lid open.
