# Decisions

| Date | Decision | By | Why |
| --- | --- | --- | --- |
| 29 Sep 2026 | Standalone GTM tool, not a Yallo Hub module | Raphy | It is the GTM operating system and stays separate |
| 2 Oct 2026 | Local PostgreSQL 16 now; move to Neon later | Raphy | Build and use locally first; plain SQL keeps the move simple |
| 2 Oct 2026 | Email and password sign-in for the local build | Plan | Works offline; Google and Microsoft sign-in need a hosted address |
| 2 Oct 2026 | Reminders sent by a scheduler inside the server, over SMTP | Plan | Works from a laptop; Mailpit for testing, any SMTP provider for real |
| 2 Oct 2026 | Rules and access enforced in PostgreSQL (functions and row-level security) | Plan | One place for rules; the app cannot bypass them; same on Neon |
| 2 Oct 2026 | Backfill window 2 working days | Plan default | One setting (app_settings.backfill_working_days); Raphy to confirm |
