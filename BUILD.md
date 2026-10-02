# BUILD.md · Yallo GTM Tracker build plan

Work through the phases in order. Each phase lists tasks, then the checks that must pass before
moving on. Read CLAUDE.md first; it overrides anything here on rules of behaviour.

**Finished means:** every phase below is Done in docs/progress.md, `npm run verify` passes, and
the app runs with `docker compose up -d && npm run dev`, with the final checklist at the bottom
satisfied.

**Commits:** follow the commit rules in CLAUDE.md on every commit: authored by Raphy only, no
co-author or AI lines, many small commits (one per task or green test step), never one per phase.
The "Commit" line at the end of each phase below is the final commit of that phase, not the only one.

**If you are resuming:** read docs/progress.md and docs/BLOCKERS.md, run `git log --oneline | head -20`,
then continue from the first phase that is not Done.

---

## Phase 0 · preflight

1. Check tools: `node -v` (20+), `npm -v`, `git status`. Check for Docker: `docker compose version`.
   Check the commit identity: `git config user.name` must be Raphy's name and `git config user.email`
   must be set. If either is missing, do not invent one: write it at the top of docs/BLOCKERS.md
   ("Set git identity before committing") and keep working without committing until it is set;
   commit everything in small steps as soon as it is.
   - If Docker works: `docker compose up -d` and wait until `docker compose ps` shows postgres healthy.
   - If Docker is missing or not running: follow docs/LOCAL_SETUP.md "Without Docker". If neither
     PostgreSQL nor Docker is available, write it in docs/BLOCKERS.md and stop: nothing else can work.
2. Create `.env` from `.env.example`. Generate `SESSION_SECRET` and `GTM_APP_PASSWORD` with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep the Mailpit SMTP defaults.
3. Create the database roles' login: write `scripts/db-setup.ts` (run as owner) that
   (a) creates the database `gtm` and `gtm_test` if missing,
   (b) runs the migration runner on both,
   (c) runs `alter role gtm_app login password '<GTM_APP_PASSWORD>'`.
   Temporary shell commands are fine in phase 0; turn them into the script in phase 1.
4. Apply `db/migrations/*.sql` in name order to `gtm` as the owner. Then run the checks:
   `psql $DATABASE_URL_OWNER_TEST -f db/verify/01_setup_as_owner.sql` on a throwaway database and
   `psql <gtm_app url> -f db/verify/02_checks_as_app.sql`. Compare with db/verify/README.md.
5. Create docs/progress.md from the template in that file (it exists) and docs/BLOCKERS.md (empty list).
6. Commit: `P0: preflight, database migrated and verified`.

**Done when:** migrations apply cleanly and every check in db/verify/README.md matches.

---

## Phase 1 · monorepo and tooling

1. Root `package.json` with npm workspaces `apps/*`, `packages/*` and the scripts listed in CLAUDE.md.
   Use `concurrently` for `dev`.
2. `packages/shared`: metric keys, enums (entry status, task status, ABM stage, roles), zod schemas
   for every API body, and the client-side mirror of the daily and weekly checks in
   docs/BUSINESS_RULES.md (messages must match the database wording exactly).
3. `apps/server` skeleton: Fastify app factory (so tests can build it without listening),
   config loaded and validated with zod from `.env`, structured logging (pino, no secrets or
   passwords in logs), error handler that maps database errors (see TECH_SPEC "Errors").
4. `apps/web` skeleton: Vite + React + TS, React Router, TanStack Query, `src/styles/tokens.css`,
   `base.css`, `components.css` copied from the `<style>` block of design/home.html. Vite proxy `/api` to :3000.
5. Migration runner `scripts/migrate.ts`: table `public._migrations(name text primary key, applied_at timestamptz)`,
   applies new files in name order, each in one transaction, as the owner. `db:migrate`, `db:reset`
   (local only: refuses if DATABASE_URL host is not localhost or 127.0.0.1), `db:verify`.
6. Seed `scripts/seed.ts` (local only, same refusal rule): invented data per docs/TESTING.md "Seed data".
   Creates test logins with known passwords printed to the console and written to
   docs/progress.md under "Local accounts".
7. `scripts/user-create.ts`: creates auth.users + profiles row, creates an invite token, prints the
   set-password link and emails it (through the mail module from phase 4; until then print only).
8. ESLint + Prettier, TypeScript strict in all packages, Vitest workspace config, Playwright config
   (base URL http://localhost:5173, chromium, 1440×900 and 390×844 projects).
9. `.gitignore`: node_modules, dist, .env*, !.env.example, data/, playwright-report, test-results.

**Done when:** `npm run lint`, `npm run typecheck`, `npm run test` (a placeholder test per package)
and `npm run db:reset` pass. Commit `P1`.

---

## Phase 2 · server core: database access, auth, security

1. `db.ts`: two pools are not needed; one pool as gtm_app. Helpers:
   - `withUser(userId, fn)`: BEGIN; `select set_config('app.user_id', $1, true)`; `set local role authenticated`; fn; COMMIT. Rollback on error.
   - `asApp(fn)`: plain transaction as gtm_app (auth module and jobs only).
2. Auth module (TECH_SPEC "Auth"): login, logout, me, accept invite, forgot password, reset.
   argon2id hashing; sessions in auth.sessions storing only the sha256 of the token; cookie
   `gtm_session` httpOnly, SameSite=Lax, Secure when NODE_ENV=production; 12-hour idle and 7-day
   absolute expiry; lock after 10 failed logins for 15 minutes; rate limit on auth routes.
   Inactive profile (profiles.active = false) cannot sign in and existing sessions stop working.
3. Request guard: every `/api` route except auth requires a valid session; admin routes also
   require role admin (viewer may read admin GET routes). Non-GET requests require header
   `X-Requested-With: gtm` and a same-origin `Origin` header (CSRF).
4. Security headers on every response (docs/SECURITY.md "Headers").
5. Tests first (Vitest with fastify.inject against `gtm_test`): login success and failure, lockout,
   session expiry, logout, invite accept, reset, inactive user blocked, CSRF header required,
   contributor blocked from admin routes.

**Done when:** all auth tests pass. Commit `P2`.

---

## Phase 3 · server features

Build the endpoints in TECH_SPEC "API", each through `withUser`. Tests first for each group.

1. Entries: open, get, autosave value (upsert into entry_values), set no_search_activity, submit
   (returns `{ok, status}` or `{ok:false, errors}` straight from submit_entry), list own history.
2. Files: multipart upload for entry fields and tasks. Check size (5 MB), real type by magic bytes
   (png, jpeg, webp, pdf only), store at `UPLOAD_DIR/{userId}/{entryOrTaskId}/{uuid}.{ext}`, insert
   the attachments row inside withUser (RLS decides). Download streams the file only after the
   attachments row is readable by the caller. Delete removes row then file.
3. Weekly: auto totals, search activities CRUD, ABM accounts picked.
4. Tasks: list (own, or all for admin with filters), detail with history, admin create and edit,
   status change through update_task. Creating or reassigning a task inserts a notification for the
   assignee (do it in a new migration as a security definer function `notify_task_assigned` called
   by a trigger, with tests).
5. ABM: list with week plan, admin create, owner or admin update stage and notes, touches upsert.
6. Notifications: list, unread count, mark read.
7. Admin: compliance (dashboard_compliance), week (dashboard_week plus weekly entry values),
   person detail, unlock (unlock_entry), users list, invite, deactivate, settings (targets,
   fields on or off, reminder rules, app settings), calendar CRUD, report data for a week, CSV export.
8. Server tests must cover every rule-level error message passing through unchanged, and access
   checks for contributor, admin and viewer on every route group.

**Done when:** server test suite passes with every route group covered. Commit `P3`.

---

## Phase 4 · email and scheduled jobs

1. Mail module (docs/EMAIL.md): nodemailer transport from SMTP_* settings; a plain branded HTML
   template and text alternative; every value HTML-escaped; one button link to APP_URL + path.
2. Reminders job: every 15 minutes with node-cron, plus once at server start: call
   `queue_due_reminders()`, then for each row of `pending_emails()`: if email_on is false mark
   skipped, else send and mark sent or failed. Never throw out of the job; log counts.
3. Monday report job at 09:00 Asia/Kolkata: build last week's summary (same data as the report
   page) and email the addresses in app_settings.report_recipients. If the list is empty, skip and log.
4. `JOBS_ENABLED` env switch (true by default locally, false in tests). `npm run jobs:run-now`.
5. Tests: with Mailpit running, run the job and read `http://localhost:8025/api/v1/messages` to
   assert one email per pending notification, then run again and assert no new emails.

**Done when:** job tests pass and emails appear in Mailpit. Commit `P4`.

---

## Phase 5 · web app shell and shared components

1. Components from docs/DESIGN.md: AppShell, Sidebar (contributor and admin menus as in the
   prototypes, with live badges for missing days and overdue tasks), PageHead, Card, StatCard,
   Banner, Pill, PaceDot, Button, NumberField with save state, ProofSlot, ProgressAside, DayTabs,
   Segmented, Drawer, Modal, Toast, DataTable, NotificationBell (poll every 60 seconds).
2. API client: fetch wrapper that sends `X-Requested-With: gtm`, credentials included, maps errors.
3. Auth screens: sign in (from design/signin.html but with email and password fields instead of
   the Google and Microsoft buttons), set password from invite link, forgot and reset password,
   "Ask Raphy for access" state for inactive accounts.
4. Route guards by role; admin and viewer land on /admin, contributors on /.

**Done when:** sign in and sign out work in the browser; unit tests for components pass. Commit `P5`.

---

## Phase 6 · contributor screens

Rebuild each screen from its prototype with live data. Check each at 1440 px and 390 px.

1. Home (design/home.html).
2. Daily log (design/daily-log.html): fields from metric_definitions plus user settings, grouped;
   autosave with 600 ms debounce; ProofSlot (compress images in the browser to 1,600 px longest
   edge, quality 0.8, before upload); Still needed panel; Submit showing server errors; day tabs
   for missing days and the backfill window; read-only view after submit; task status rows.
3. Weekly log (design/weekly-log.html): auto totals read-only, fields, uploads, follower growth,
   company names when form responses are above 0, search activity rows or "none", ABM picker,
   reflections, preview banner before Friday 16:00.
4. My tasks (design/my-tasks.html) with drawer, history, Blocked note and Done proof.
5. ABM tracker (design/abm-tracker.html): board, week strip, account drawer; Add account for admin.

**Done when:** Playwright journeys J1 to J7 in docs/TESTING.md pass. Commit `P6`.

---

## Phase 7 · manager screens

1. Dashboard (design/dashboard.html): KPIs, compliance grid, targets with pace dot (formula in
   BUSINESS_RULES), outcomes week on week, impressions chart as inline SVG, ABM, backlog, search.
2. Person detail (design/person.html) with proof viewer and Unlock with reason.
3. Task management (design/task-management.html).
4. Settings (design/settings.html): targets, fields per person, reminder times, users (invite, deactivate).
5. Holidays and leave (design/calendar.html).
6. Weekly report (design/weekly-report.html) with print stylesheet and CSV export.

**Done when:** journeys J8 to J12 pass. Commit `P7`.

---

## Phase 8 · finish and verify

1. Run `npm run verify`. Fix until green.
2. Accessibility: run axe in Playwright on every screen; fix serious and critical issues.
3. Visual check: for each screen, screenshot the built page and the prototype at 1440 px with
   Playwright into `test-results/visual/`, compare by eye, fix clear differences. List remaining
   differences in docs/progress.md.
4. Security checklist in docs/SECURITY.md: confirm each item, note any gap in docs/BLOCKERS.md.
5. Update README.md "Useful commands" if anything changed. Make sure a fresh clone works:
   `docker compose up -d && npm install && npm run db:reset && npm run dev`.
6. Final docs/progress.md: every phase status, test counts by suite, local accounts, open items.
7. Commit `P8: release candidate`.

## Final checklist
- [ ] `npm run verify` passes, with counts recorded in docs/progress.md
- [ ] Daily sign-off rules behave exactly as docs/BUSINESS_RULES.md (database tests prove it)
- [ ] A contributor cannot read another person's data through any API route (tests prove it)
- [ ] Reminder emails appear in Mailpit once, never twice
- [ ] All 12 screens built and reachable from the menus; no sample data from the prototypes left in code
- [ ] No secrets in git (`git log -p | grep -iE "password|secret|api[_-]?key"` shows only names and placeholders)
- [ ] docs/BLOCKERS.md lists every decision taken without the owner
