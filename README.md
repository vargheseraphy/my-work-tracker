# Yallo GTM Tracker

A web app where the GTM team (Tanzil, Anil, Tamre) logs daily and weekly activity with proof, cannot sign off with gaps, and gets email reminders. Raphy gets a dashboard and a Monday report.

This folder is the **starting kit**. It holds the requirements, the designs, a tested database and the step-by-step build instructions. Claude Code builds the app from it.

Everything runs **on your own computer**: local PostgreSQL, local email testing, local file storage. It moves to Neon (hosted PostgreSQL) later without rewriting anything. See `docs/NEON_MIGRATION.md`.

---

## What is in this kit

| Path | What it is |
| --- | --- |
| `START_HERE_PROMPT.md` | The text you paste into Claude Code to start the overnight build |
| `BUILD.md` | The full build plan Claude follows, phase by phase |
| `CLAUDE.md` | Rules Claude reads automatically in every session |
| `design/` | 13 HTML screens. The visual source of truth. Open `design/index.html` in a browser. |
| `db/migrations/` | Six SQL files that create the whole database. Already tested. |
| `db/verify/` | SQL checks that prove the rules and security work |
| `docs/` | Requirements, business rules, technical spec, database, security, email, testing, Neon move |
| `docker-compose.yml` | Starts PostgreSQL 16 and Mailpit (a local inbox that catches test emails) |
| `.env.example` | Settings template. The build copies it to `.env`. |
| `.claude/settings.json` | Command permissions for the overnight run |

---

## Tonight: start the build (about 15 minutes of your time)

### 1. Install these once

| Tool | Check it is installed | Install |
| --- | --- | --- |
| Node.js 20 or newer | `node -v` | nodejs.org, the LTS version |
| Docker Desktop | `docker -v` | docker.com/products/docker-desktop. Open it once so it is running. |
| Git | `git --version` | Comes with macOS developer tools: run `xcode-select --install` |
| Claude Code | `claude --version` | docs.claude.com, Claude Code quickstart |

No Docker? Use the native option in `docs/LOCAL_SETUP.md` (Homebrew PostgreSQL 16 and Mailpit). Tell Claude which one you used at the start.

### 2. Put the kit in a folder and make it a repository

```bash
cd ~/Projects                 # or wherever you keep code
unzip ~/Downloads/gtm-tracker.zip
cd gtm-tracker
git init
```

### 3. Set your name on the commits

Every commit in this project is made in your name only, with no co-author lines. Set it once in the folder:

```bash
git config user.name "Raphy"
git config user.email "your.work@email"      # your real work email
```

Then save the starting kit as the first commit:

```bash
git add -A && git commit -m "Starting kit"
```

`.claude/settings.json` already switches off Claude's co-author line, and CLAUDE.md tells Claude to commit in small steps (many commits, never one big one).

### 4. Keep the laptop awake and on power

Plug the MacBook in. In a **separate** Terminal window, run this and leave it open all night:

```bash
caffeinate -dims
```

That stops the Mac sleeping. Closing the lid can still sleep it, so leave the lid open.

### 5. Start Claude Code in auto mode

In the `gtm-tracker` folder:

```bash
claude --permission-mode auto
```

Auto mode lets Claude run approved commands without asking you each time. If your account does not offer auto mode, use `claude --permission-mode acceptEdits` instead; the allow list in `.claude/settings.json` covers the usual commands, but Claude may stop to ask for anything outside it.

### 6. Paste the start prompt

Open `START_HERE_PROMPT.md`, copy the block under **"Paste this"**, paste it into Claude Code, and press Enter. Then leave it running.

---

## Tomorrow morning: check the result

1. Read `docs/progress.md`. It lists every phase as Done, Partly done or Not started, with test counts.
2. Read `docs/BLOCKERS.md`. Anything Claude could not decide or finish is listed there with what it chose instead.
3. Start the app:

```bash
docker compose up -d          # database and Mailpit
npm run dev                   # web app and server
```

4. Open **http://localhost:5173**. Sign in with the admin account Claude created. The sign-in details are in `docs/progress.md` under "Local accounts". They are test accounts with invented data.
5. Open **http://localhost:8025** to see every email the app sent (Mailpit). Nothing leaves your computer until you configure a real email account.

If anything is unfinished, start Claude Code again and paste the **"Continue"** block from `START_HERE_PROMPT.md`.

---

## Email reminders from your computer

Yes, this works locally. The server has a built-in scheduler that checks every 15 minutes and sends reminders.

- **During the build and testing:** emails go to Mailpit at http://localhost:8025. Nobody receives anything.
- **For real reminders:** put an email account's SMTP settings in `.env` (see `docs/EMAIL.md`). The app then emails the team.
- **The catch:** reminders only go out while your computer is on and the app is running. If the Mac was asleep, the app sends the missed reminders within 3 hours of their time when it wakes. For reminders that never miss, host the app (see `docs/NEON_MIGRATION.md`).

---

## Useful commands (after the build)

| Command | Does |
| --- | --- |
| `brew services start postgresql@16 mailpit` | Start PostgreSQL and Mailpit. With Docker: `docker compose up -d` |
| `npm run dev` | Start the server (:3000) and the web app (:5173) |
| `npm run db:setup` | Create the databases, migrate them and set the `gtm_app` password |
| `npm run db:migrate` | Apply any migration that has not run yet |
| `npm run db:reset` | Drop, recreate, migrate and seed the local database |
| `npm run db:seed` | Load invented sample data (local only) |
| `npm run db:verify` | Run the 15 SQL checks in `db/verify` against a throwaway database |
| `npm run user:create -- --email someone@yallo.co --name "Name" --role contributor` | Invite a person; prints and emails their set-password link |
| `npm run test` | Vitest: shared, server, database and jobs |
| `npm run e2e` | Playwright: the browser journeys, at 1440 px and 390 px |
| `npm run verify` | Everything: lint, types, unit, server, database, browser |
| `npm run jobs:run-now` | Run the reminder job once, now. Add `--report` for the Monday report |
| `npm run build` | Build the server and the web app for production |

### If PostgreSQL is not on your PATH

This machine has it under Homebrew. Add it once:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
```

### Starting from nothing on another machine

```bash
brew install postgresql@16 mailpit     # or install Docker and use docker-compose.yml
brew services start postgresql@16
brew services start mailpit
cp .env.example .env                   # then set GTM_APP_PASSWORD and SESSION_SECRET
npm install
npm run db:setup
npm run db:seed
npm run dev
```
