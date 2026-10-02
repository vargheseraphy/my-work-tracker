# Start prompts for Claude Code

Open Terminal in the `gtm-tracker` folder and start Claude Code:

```bash
claude --permission-mode auto
```

(If auto mode is not available on your account: `claude --permission-mode acceptEdits`.)

---

## Paste this to start the overnight build

`/goal` keeps Claude working, turn after turn, until the condition is met. Paste the whole block as one message.

```
/goal Build the Yallo GTM Tracker by following BUILD.md from Phase 0 to Phase 8. First read CLAUDE.md, BUILD.md, README.md and every file in docs/, then open design/index.html and the screens it links to. Work fully autonomously: never stop to ask me anything. When something is unclear, choose the safest option consistent with the docs, write the question and your choice in docs/BLOCKERS.md, and carry on. Write tests first. Commit in many small steps (one per task or green test step), authored by Raphy only with the git identity already set in this repository, with no co-author, Claude or AI lines in any message; never push. Keep docs/progress.md up to date after every phase. The goal is met when every phase in docs/progress.md is marked Done, `npm run verify` passes, and every item in the final checklist at the bottom of BUILD.md is ticked. If something makes a phase impossible (for example PostgreSQL cannot run on this machine), record it in docs/BLOCKERS.md, finish everything that does not depend on it, then stop.
```

---

## If `/goal` is not available

Paste this instead. You may need to type "continue" if it stops.

```
Read CLAUDE.md, BUILD.md, README.md and every file in docs/, then open design/index.html and the screens it links to. Then execute BUILD.md from Phase 0 to Phase 8 without stopping to ask me questions. Record unclear points and your choices in docs/BLOCKERS.md. Write tests first. Commit in many small steps, authored by Raphy only, with no co-author, Claude or AI lines; never push. Update docs/progress.md after every phase. Do not stop until every phase is Done and `npm run verify` passes, unless something makes it impossible; then record why in docs/BLOCKERS.md.
```

---

## Continue (next morning, or after a stop)

```
/goal Resume the Yallo GTM Tracker build. Read CLAUDE.md, BUILD.md, docs/progress.md and docs/BLOCKERS.md, and run git log --oneline | head -20. Continue from the first phase that is not Done, working autonomously as before. The goal is met when every phase in docs/progress.md is Done, `npm run verify` passes and the BUILD.md final checklist is ticked.
```

---

## Fix a specific problem

```
Read CLAUDE.md and docs/progress.md. Problem: <describe what you saw, the screen, and what you expected>. Write a failing test that shows the problem, fix it, run npm run verify, commit, and update docs/progress.md.
```

---

## Running it without the chat window (optional)

The same goal can run headless from Terminal and print a result at the end:

```bash
claude -p "/goal Build the Yallo GTM Tracker by following BUILD.md ... (the rest of the first block)" --permission-mode auto
```

The interactive window above is easier to check in the morning, so use that unless you have a reason not to.
