# Blockers and decisions taken without the owner

Claude adds one entry for every question it could not ask, every conflict between docs, and anything
it could not finish. Raphy reviews this list each morning.

| Date | Phase | Question or problem | What Claude chose | Needs owner? |
| --- | --- | --- | --- | --- |
| 2 Oct 2026 | 0 | Docker is not installed on this machine, so `docker compose up -d` cannot start PostgreSQL and Mailpit. | Followed docs/LOCAL_SETUP.md "Without Docker": installed `postgresql@16` and `mailpit` with Homebrew and started both as services. PostgreSQL 16.15 on :5432, Mailpit on :1025 and :8025. Same ports, same `.env`, so `docker-compose.yml` still works if Docker is installed later. | No |
| 2 Oct 2026 | 0 | The starting kit sat in a `build-plan/` sub-folder, but docs/TECH_SPEC.md section 2 puts `CLAUDE.md`, `BUILD.md`, `docs/`, `db/` and `design/` at the repository root. | Moved the kit up to the repository root and removed the empty `build-plan/` folder, then ran `git init` there. | No |
| 2 Oct 2026 | 0 | Node 23.6.0 is installed, not Node 20 LTS. | Carried on: CLAUDE.md asks for "Node 20", and the plan's README says "Node.js 20 or newer". Nothing in the stack needs an older runtime. | No |
| 2 Oct 2026 | 0 | `git config user.name` was "Raphy Varghese" globally; README.md asks for "Raphy". | Set the repository-local identity to `Raphy <raphy202@gmail.com>`. Global settings untouched. Change the email with `git config user.email` if a work address is preferred. | Yes, confirm the email |
| 2 Oct 2026 | 0 | `db/verify` needs a throwaway database; the name is not given. | Created `gtm_verify` alongside `gtm` and `gtm_test`. `npm run db:verify` recreates it each run. | No |
