# Moving to Neon later

The database was written for plain PostgreSQL 16 and tested with a non-superuser owner, which is how
Neon works. The move is mostly connection strings. Do it after the team has used the local app for a
week or two.

## What changes
| Part | Local now | After the move |
| --- | --- | --- |
| Database | PostgreSQL in Docker | Neon project (choose the region closest to the team) |
| Owner role | gtm_owner | neondb_owner (Neon's default owner) |
| App role | gtm_app | gtm_app (created by migration 0000; set its password once) |
| Server | your laptop | a small always-on host, so reminders never miss |
| Files | ./data/uploads | S3-compatible storage (for example Cloudflare R2); swap files/storage.ts |
| Email | Mailpit or SMTP from the laptop | the same SMTP settings on the host |

Neon is the database only. For reminders to run when your laptop is off, the server also needs a host.

## Steps
1. Create the Neon project and database `gtm`. Copy the owner connection string (with `sslmode=require`).
2. Run the migrations as the owner: `DATABASE_URL_OWNER=<neon owner url> npm run db:migrate`.
3. Give the app role a password:
   `psql "<neon owner url>" -c "alter role gtm_app login password '<new long random password>'"`.
   If Neon refuses this, create or reset the role's password from the Neon console instead and
   check that `gtm_app` is still a member of `authenticated` (`\du` in psql).
4. Copy the data:
   ```bash
   pg_dump --data-only --exclude-table=public._migrations "<local owner url>" > data.sql
   psql "<neon owner url>" -f data.sql
   ```
   Triggers fire during the copy and will add audit rows; that is harmless.
5. Point the server at Neon: `DATABASE_URL=postgres://gtm_app:<password>@<neon host>/gtm?sslmode=require`.
6. Run `npm run db:verify` against a separate Neon branch, never the live database.
7. Check one person's dashboard numbers against the local copy before switching the team.

## Things to check on Neon at the time
- That creating roles and `alter role ... login password` work from SQL for the owner role.
- Connection pooling: use Neon's pooled connection string for the server. Our transactions use
  `set_config(..., true)` and `set local role`, which stay inside one transaction and are safe with
  transaction pooling.
- Backups and point-in-time restore on the chosen plan.
