# Technical specification

Version 2.0, 2 October 2026. Local-first build: PostgreSQL 16 on this computer, Node server,
React web app, Mailpit for email. Moves to Neon later by changing connection strings.

## 1. Architecture

```
Browser (React SPA, Vite :5173)
   │  /api/*  (cookie session, X-Requested-With: gtm)
   ▼
Node server (Fastify :3000) ──────────────► Mailpit :1025 locally, or a real SMTP server
   │  login role gtm_app                         (reminders, invites, Monday report)
   │  per request: set_config('app.user_id') + SET LOCAL ROLE authenticated
   ▼
PostgreSQL 16 (Docker :5432, later Neon)
   · 17 tables in public, 3 in auth
   · row-level security on every public table
   · rules in functions: open_entry, submit_entry, unlock_entry, update_task, ...
   · reminder logic in queue_due_reminders()

Scheduler (node-cron inside the server): reminders every 15 min, report Monday 09:00 India time
Files: ./data/uploads/{userId}/{entryOrTaskId}/{uuid}.{ext}   (later S3-compatible storage)
```

Why this shape: the database is the single place where rules and access live, so the app cannot
bypass them, and the same SQL runs locally and on Neon.

## 2. Folder layout

```
gtm-tracker/
├── CLAUDE.md  BUILD.md  README.md  START_HERE_PROMPT.md
├── docker-compose.yml  .env.example  .gitignore  .claude/settings.json
├── design/                  13 prototype screens (visual source of truth)
├── docs/                    this spec and the other docs
├── db/migrations/           0000 to 0005 (+ new numbered files you add)
├── db/verify/               SQL checks with expected results
├── scripts/                 migrate.ts, db-setup.ts, seed.ts, user-create.ts, jobs-run-now.ts
├── packages/shared/src/     metrics.ts, enums.ts, schemas/*.ts, rules/daily.ts, rules/weekly.ts
├── apps/server/src/
│   ├── app.ts  server.ts  config.ts  db.ts  errors.ts  security.ts
│   ├── auth/      routes.ts service.ts sessions.ts passwords.ts
│   ├── entries/   routes.ts service.ts
│   ├── files/     routes.ts storage.ts
│   ├── tasks/  abm/  notifications/  admin/  report/
│   ├── mail/      transport.ts templates.ts
│   └── jobs/      scheduler.ts reminders.ts weekly-report.ts
│   └── test/      helpers.ts and *.test.ts per module
├── apps/web/src/
│   ├── main.tsx  App.tsx  routes.tsx  api.ts
│   ├── styles/tokens.css base.css components.css
│   ├── components/  (see docs/DESIGN.md)
│   └── features/  auth home daily-log weekly-log tasks abm dashboard people task-admin settings calendar report
└── e2e/                     Playwright journeys J1 to J12
```

## 3. Database access (must follow exactly)

```ts
// apps/server/src/db.ts
export async function withUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query("select set_config('app.user_id', $1, true)", [userId]);
    await c.query('set local role authenticated');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) { await c.query('rollback'); throw e; }
  finally { c.release(); }
}
// asApp(fn): same transaction handling, no set_config, no set role. Only auth/ and jobs/ may import it.
```

- `pool` connects with `DATABASE_URL` (role gtm_app). Never use the owner URL in the server.
- Add an ESLint rule (no-restricted-imports) so only `auth/**` and `jobs/**` can import `asApp`.

## 4. Auth

| Item | Design |
| --- | --- |
| Sign-in | Email and password. Google and Microsoft sign-in come later, with hosting. |
| Accounts | Invite only. Admin invites from Settings or `npm run user:create`. The invite email holds a one-time link `/set-password?token=...` valid 48 hours. |
| Passwords | argon2id (`argon2` package defaults). Minimum 12 characters. |
| Tokens | Random 32 bytes, base64url. Only the sha256 hex is stored (auth.tokens, auth.sessions). |
| Session cookie | `gtm_session`, httpOnly, SameSite=Lax, Path=/, Secure when NODE_ENV=production. |
| Expiry | 12 hours idle (last_seen_at refreshed at most once a minute), 7 days absolute. |
| Lockout | 10 failed logins locks the account 15 minutes. Same error message for wrong email or wrong password. |
| Rate limit | Auth routes: 20 requests per 15 minutes per IP. |
| Inactive | profiles.active = false: login refused, existing sessions rejected on next request. |
| Allowed domains | `ALLOWED_EMAIL_DOMAINS` checked when inviting. |
| CSRF | Non-GET `/api` requests need `X-Requested-With: gtm` and an Origin matching APP_URL. |
| First admin | `npm run user:create -- --email ... --name ... --role admin` prints the set-password link. |

## 5. API

All routes under `/api`, JSON unless noted. Auth column: C contributor, A admin, V viewer.

### Auth
| Method and path | Who | Body or query | Returns |
| --- | --- | --- | --- |
| POST /auth/login | public | email, password | `{user}` and cookie |
| POST /auth/logout | any | | 204 |
| GET /auth/me | any | | `{id, email, fullName, role, timezone}` |
| POST /auth/accept-invite | public | token, password | `{user}` and cookie |
| POST /auth/forgot | public | email | 204 always (no account enumeration) |
| POST /auth/reset | public | token, password | 204 |

### Contributor
| Method and path | Who | Uses | Req IDs |
| --- | --- | --- | --- |
| GET /home | C | missing_days, dashboard_week (own), v_open_tasks, v_abm_week_plan | home |
| POST /entries/open | C | open_entry(type, period) then fields, values, attachments | DAY-01, WK-01 |
| GET /entries/:id | C A V | entry with fields, values, attachments, search rows, ABM picks | |
| PUT /entries/:id/values/:metricKey | C | upsert entry_values (numValue, textValue, note) | DAY-02 |
| PATCH /entries/:id | C | noSearchActivity | WK-05 |
| POST /entries/:id/submit | C | submit_entry → `{ok,status}` or `{ok:false, errors[]}` | DAY-03..10 |
| GET /entries?type=&from=&to= | C | own list | |
| GET /weekly/:monday/auto-totals | C | week_auto_totals | WK-02 |
| POST /entries/:id/search-activities | C | insert | WK-05 |
| PUT/DELETE /search-activities/:id | C | update, delete | WK-05 |
| PUT /entries/:id/abm-accounts | C | replace the set of picked accounts | WK-06 |
| POST /entries/:id/attachments (multipart: metricKey, file) | C | store file + attachments row | DAY-04, DAY-11 |
| POST /tasks/:id/attachments (multipart) | C | store file + row | TSK-02 |
| DELETE /attachments/:id | C | row then file | |
| GET /files/:attachmentId | C A V | stream after RLS-checked select | |
| GET /tasks?status=&owner= | C A V | own (C) or all (A, V) | TSK |
| GET /tasks/:id | C A V | task with task_updates | TSK-03 |
| POST /tasks/:id/status | C A | update_task(status, note, proofUrl) | TSK-02 |
| GET /abm | C A V | accounts, week plan, touches | ABM-03 |
| PATCH /abm/:id | C(owner) A | stage, notes, links | ABM-02 |
| PUT /abm/:id/touches/:monday | C(owner) A | emails, messages, calls | ABM-04 |
| GET /notifications | any | latest 50 and unread count | NTF-03 |
| POST /notifications/:id/read | any | mark read | NTF-03 |

### Admin (V may call the GET routes)
| Method and path | Uses | Req IDs |
| --- | --- | --- |
| GET /admin/compliance?month=YYYY-MM | dashboard_compliance | DSH-01 |
| GET /admin/week?monday= | dashboard_week + weekly values (outcomes, impressions 12 weeks) | DSH-02..04 |
| GET /admin/people/:id?days=10 | entries, values, attachments, weekly logs | DSH-06 |
| POST /admin/unlock | unlock_entry(userId, type, period, reason) | DSH-06 |
| POST /tasks, PATCH /tasks/:id | insert, update (title, description, assignee, due, priority, cancel) | TSK-01, 04 |
| POST /abm | insert account | ABM-01 |
| GET/PUT /admin/settings/targets | user_metric_settings.weekly_target | ADM-01 |
| GET/PUT /admin/settings/fields | user_metric_settings.enabled | ADM-02 |
| GET/PUT /admin/settings/reminders | reminder_rules | ADM-03 |
| GET/PUT /admin/settings/app | app_settings (deadlines, backfill, report recipients) | ADM-03 |
| GET/POST/DELETE /admin/calendar | calendar_days | ADM-04 |
| GET /admin/users, POST /admin/users/invite, PATCH /admin/users/:id | profiles + auth (invite through the auth service) | ADM-05 |
| GET /admin/report?monday= | report data | RPT-01 |
| GET /admin/export.csv?month=YYYY-MM | metrics as rows, days as columns, per person | RPT-03 |

### Errors
| Source | HTTP | Body |
| --- | --- | --- |
| zod validation | 400 | `{error:'invalid', fields:{...}}` |
| No session | 401 | `{error:'signin'}` |
| Postgres 42501 or RLS insert/update refusal | 403 | `{error:'forbidden'}` |
| Rule exception raised in a function (P0001) | 409 | `{error:'rule', message}` shown as is |
| submit_entry with problems | 200 | `{ok:false, errors:[...]}` |
| Not found or not visible | 404 | `{error:'not_found'}` |
| Anything else | 500 | `{error:'server'}`; details only in the log |

## 6. Files

- Allowed: image/png, image/jpeg, image/webp, application/pdf. Check the real type with
  `file-type` from the first bytes, not the browser's claim. Maximum 5 MB.
- The web app compresses images before upload (browser-image-compression: maxWidthOrHeight 1600,
  initialQuality 0.8), which also strips location data.
- Path: `UPLOAD_DIR/{userId}/{entryId or taskId}/{uuid}.{ext}`. Never use the uploaded file name in the path.
- Download: `select storage_path, mime_type from attachments where id = $1` inside withUser; no row
  means 404. Send with `Content-Disposition: inline` for images and pdf, `X-Content-Type-Options: nosniff`.
- Later: swap `files/storage.ts` for an S3-compatible implementation with the same interface.

## 7. Jobs

| Job | When | Steps |
| --- | --- | --- |
| reminders | `REMINDER_CRON` (every 15 min) and once at start | asApp: `select * from queue_due_reminders()`, then `pending_emails()`; send each; `mark_email(id, status)` |
| weekly report | `REPORT_CRON` in `REPORT_TIMEZONE` (Mon 09:00 India time) | build last week's report data as an admin (withUser with the first active admin's id); email `app_settings.report_recipients`; skip if empty |

Reminders catch up: a rule can fire for 3 hours after its time, so a computer that was asleep still
sends them. The notifications unique key prevents duplicates.

## 8. Configuration

All settings come from `.env` (see `.env.example`), validated at start with zod. The server refuses
to start if a required value is missing, if `SESSION_SECRET` is shorter than 32 characters, or if
`DATABASE_URL` uses the owner role.

## 9. Requirement IDs

| ID | Requirement |
| --- | --- |
| AUTH-01 | Email and password sign-in for invited people |
| AUTH-02 | Invite only; no self sign-up |
| AUTH-03 | Roles admin, contributor, viewer; routes and data limited by role |
| AUTH-04 | Admin can deactivate a user; sessions stop working |
| AUTH-05 | 12-hour idle sign-out; unsaved values kept in session storage |
| DAY-01 | One daily entry per person per working day; only that person's enabled fields |
| DAY-02 | Autosave on typing; nothing lost on refresh |
| DAY-03 | Every enabled field required; 0 valid, blank not |
| DAY-04 | Proof required when a proof field is above 0 |
| DAY-05 | Contacts filtered not more than contacts added |
| DAY-06 | Open tasks due on or before the day need a status update |
| DAY-07 | A missed working day blocks today |
| DAY-08 | Backfill 2 working days, marked late; older needs admin unlock |
| DAY-09 | Submit locks; server re-checks every rule |
| DAY-10 | Value over 3× the 4-week average needs a note |
| DAY-11 | Up to 5 files per field, 5 MB each, compressed in the browser |
| WK-01 | Weekly log opens Friday 16:00, due Monday 12:00, local time |
| WK-02 | Auto totals from daily logs, read-only |
| WK-03 | Calls, meetings, open rate + screenshot, impressions + screenshot, followers, form responses + companies, Google Analytics upload + users, sessions, top page |
| WK-04 | Follower growth from last week |
| WK-05 | SEO, AEO, GEO rows or "none this week" |
| WK-06 | ABM accounts worked, if the person owns a live account |
| WK-07 | Three reflections, 1 to 500 characters |
| TSK-01 | Admin creates tasks: title, details, assignee, due, priority; assignee notified |
| TSK-02 | Status change with note; Blocked needs a note; Done needs proof |
| TSK-03 | Status history kept |
| TSK-04 | Admin reassigns, changes due date, cancels |
| ABM-01 | Admin adds account: name, vertical, region, owner, launch week |
| ABM-02 | Owner or admin moves stage; logged |
| ABM-03 | One-account-a-week strip with gaps flagged |
| ABM-04 | Weekly touches per account |
| DSH-01 | Compliance grid, person by day |
| DSH-02 | Week against target with pace dot |
| DSH-03 | Outcomes week on week |
| DSH-04 | Impressions trend, 12 weeks |
| DSH-05 | ABM, backlog, search panels |
| DSH-06 | Person detail; unlock with reason |
| DSH-07 | Dashboard under 2 seconds with a year of data |
| ADM-01..05 | Targets, fields per person, reminder times, holidays and leave, invite and deactivate |
| NTF-01..03 | Reminders by email and in-app, in local time, once only; bell with unread count |
| RPT-01..03 | Report page printable to A4; Monday email; monthly CSV export |

## 10. Non-functional

| Area | Requirement |
| --- | --- |
| Performance | Field save under 500 ms locally; dashboard under 2 s with a year of seed data; web bundle under 300 KB gzipped |
| Devices | Chrome, Edge, Safari; usable at 390 px |
| Accessibility | WCAG 2.2 AA; axe shows no serious or critical issues |
| Time | Dates in each person's time zone (database decides "today"); timestamps stored in UTC |
| Scale | Up to 25 users without schema change |
| Portability | Plain PostgreSQL 16 only; runs on Neon by changing connection strings |
| Copy | UK English, sentence case, no exclamation marks |
