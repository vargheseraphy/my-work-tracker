# Yallo GTM Tracker · rules for Claude

You are building a standalone web app for the Yallo GTM team. Contributors log daily and weekly
activity with proof, cannot sign off with gaps, and get email reminders. The admin (Raphy) gets a
dashboard and a Monday report. Everything runs locally first, and must move to Neon (hosted
PostgreSQL) later with only a connection string change.

The build plan is BUILD.md. Work through it phase by phase. Record progress in docs/progress.md.

## Sources of truth, in this order
1. docs/BUSINESS_RULES.md and db/migrations/ : the rules, already enforced and tested in the database.
2. docs/PRD.md and docs/TECH_SPEC.md : what to build, the API, requirement IDs.
3. design/*.html : the look of every screen. Match layout, copy, spacing, states. Replace sample
   data with live data. Do not invent screens or colours.
4. docs/SECURITY.md, docs/DATABASE.md, docs/TESTING.md, docs/EMAIL.md.
If two sources disagree, follow the higher one, write the conflict in docs/BLOCKERS.md, and continue.

@docs/TECH_SPEC.md
@docs/BUSINESS_RULES.md

## Stack (do not change without writing a reason in docs/DECISIONS.md)
- npm workspaces monorepo: apps/server, apps/web, packages/shared
- Server: Node 20, TypeScript strict, Fastify, node-postgres (pg), zod, argon2, nodemailer,
  node-cron, @fastify/cookie, @fastify/multipart, @fastify/rate-limit, file-type
- Web: React 18, TypeScript strict, Vite, React Router, TanStack Query, React Hook Form + zod,
  plain CSS with tokens copied from design/ (no UI library, no Tailwind)
- Database: PostgreSQL 16, plain SQL migrations in db/migrations, own small migration runner
- Tests: Vitest (unit, server, database), Playwright (browser journeys)
- Local services: docker-compose.yml (postgres:16, Mailpit). Files on disk in data/uploads.

## How the database is used (critical)
- The server logs in as role gtm_app. For every web request it runs, inside one transaction:
  `select set_config('app.user_id', $userId, true); set local role authenticated;`
  then the queries. Row-level security does the access control. Use the helper withUser().
- Auth tables (auth.users, auth.sessions, auth.tokens) are queried as gtm_app WITHOUT
  switching role, only in the auth module.
- Job functions (queue_due_reminders, pending_emails, mark_email) are called as gtm_app
  without a user set, only in the jobs module.
- Rules with business meaning are only changed through the database functions
  (open_entry, submit_entry, unlock_entry, update_task). Never re-implement them in TypeScript.
  The web app repeats checks only for instant feedback; the server response always wins.
- Never edit an applied migration. Add a new numbered file. Every new table: enable RLS, revoke
  from public, grant only what is needed to authenticated, add policies, add tests.
- Migrations run as the owner role (DATABASE_URL_OWNER). The app never uses the owner role.
- No Neon-only or Supabase-only features. Plain PostgreSQL 16 only.

## Working rules
- Autonomous run: do not stop to ask questions. When something is unclear, choose the option
  that is safest and most consistent with the docs, write the question and your choice in
  docs/BLOCKERS.md, and continue.
- Tests first for each feature, then code. A phase is done only when `npm run verify` passes.
- Commits (project rule, set by Raphy):
  - Every commit is authored by Raphy only, using the git identity already configured in this
    repository. Never change user.name or user.email, never use --author, never commit as Claude.
  - No co-author lines. Never add "Co-Authored-By", "Generated with Claude Code", or any mention of
    Claude or AI in commit messages. (.claude/settings.json also switches attribution off.)
  - Make as many small commits as possible: one per task, one per green test step, one per
    screen part. Never bundle a whole phase into one commit. Aim for 10 or more commits per phase.
  - Message format: `P3 DAY-04: proof upload and attachment row` (phase, requirement ID if any,
    what changed, sentence case). Stage only the files for that change (`git add <paths>`).
  - Pushing, amending a previous commit and rewriting history are all allowed when Raphy asks
    for them.
- Update docs/progress.md at the end of every phase: status, what was built, test counts,
  anything left.
- If a command or test fails three times the same way, stop retrying it: record it in
  docs/BLOCKERS.md and move to the next task you can do.
- Keep secrets out of git. .env is git-ignored. Generate local secrets with crypto random bytes.
  Never write a real person's email or password into code, seed data, tests or docs.
- Seed and test data are invented. Use [Account A] style names. The admin test login and
  contributor test logins go in docs/progress.md under "Local accounts".
- Do not call external services except the npm registry. Email goes to Mailpit unless .env has
  real SMTP settings. Do not change .env SMTP settings yourself.
- Copy: UK English, sentence case, no exclamation marks. Gold #D4A843 only for keylines and
  markers, never text or fill on white.
- Accessibility: real buttons, inputs with labels, keyboard reachable, visible focus, 4.5:1
  contrast, status never by colour alone.
- Do not run destructive commands outside this folder. Do not delete the database volume
  unless BUILD.md says so.

## Commands (create these in phase 1 and keep them working)
npm run dev              # server :3000 and web :5173 together (Vite proxies /api)
npm run build
npm run lint
npm run typecheck
npm run test             # Vitest: shared, server, database
npm run e2e              # Playwright, needs dev servers and services up
npm run verify           # lint + typecheck + test + e2e
npm run db:migrate       # apply new migrations as owner
npm run db:reset         # drop and recreate the local database, migrate, seed (local only)
npm run db:seed
npm run db:verify        # run db/verify SQL checks against a throwaway database
npm run user:create      # --email --name --role [--timezone]
npm run jobs:run-now     # run reminders once
