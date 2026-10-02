# Security

The tool holds named people's performance data and screenshots that may show client names. Treat it
as confidential. The main defence: the database decides who can see and change each row, so a bug in
the server or web app cannot leak data or skip a rule.

## Controls (confirm each in phase 8)
| Area | Control |
| --- | --- |
| Accounts | Invite only. Allowed email domains checked on invite. No self sign-up. |
| Passwords | argon2id; minimum 12 characters; never logged; reset by one-time emailed link (1 hour) |
| Sessions | Random token in an httpOnly, SameSite=Lax cookie (Secure in production); only its sha256 stored; 12-hour idle and 7-day absolute expiry; all sessions removed on deactivation and password reset |
| Brute force | 10 failures lock the account for 15 minutes; auth routes rate-limited; one generic error message |
| CSRF | Non-GET requests need `X-Requested-With: gtm` and a matching Origin |
| Authorisation | Every web request runs as role `authenticated` with `app.user_id` set; row-level security on all 17 public tables; default deny with minimal grants |
| Rules | Entry status, lateness and task status change only inside database functions; a trigger refuses value changes on a locked entry |
| Auth data | `auth` schema invisible to web requests; only the auth module touches it |
| Jobs | Reminder and email functions callable only by `gtm_app` outside a user context |
| Files | Real type checked from file bytes; png, jpeg, webp, pdf only; 5 MB; random file names; streamed only after an RLS-checked lookup; images re-encoded in the browser, which strips location data |
| Input | zod on every request body; database constraints repeat types, ranges and lengths; React escapes output; email templates escape every value |
| Links | Proof links must start with https://; opened with rel="noopener noreferrer" |
| Secrets | Only in `.env` (git-ignored). The server refuses to start with the owner role or a short session secret. |
| Audit | Inserts, updates and deletes on key tables logged with actor, old and new values; admin-only read |
| Logs | No passwords, tokens, cookies or file contents in logs |
| Local only | db:reset and db:seed refuse to run unless the database host is localhost |
| Dependencies | Lockfile committed; `npm audit --omit=dev` shows no high or critical issues at release |

## Headers (every response)
```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```
Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` only when served over HTTPS.
In development Vite needs inline scripts for hot reload: apply the CSP to the server and the
production build only.

## Who can do what
| Action | Contributor | Admin | Viewer |
| --- | --- | --- | --- |
| See own entries, tasks, notifications | Yes | Yes | Yes |
| See other people's entries and proof | No | Yes | Yes |
| Edit own draft or unlocked entry; submit | Yes | Yes (own) | No |
| Unlock an entry or open a missed day | No | Yes | No |
| Create, reassign, cancel tasks | No | Yes | No |
| Update task status | Own | Any | No |
| Add ABM accounts; change owner or week | No | Yes | No |
| Move ABM stage, log touches | Own accounts | Any | No |
| Targets, fields, reminders, calendar, users | No | Yes | No |
| Read the audit log | No | Yes | No |

## Threats and responses
| Threat | Response |
| --- | --- |
| Contributor changes browser code to mark a day submitted | Status cannot be written by web requests; only `submit_entry` sets it after all checks |
| Contributor reads a teammate's data through the API | RLS returns no rows; server tests prove it for every route group |
| Numbers changed after sign-off | Lock trigger refuses; admin unlock needed; audit keeps old values |
| Stolen session cookie | httpOnly, SameSite, idle expiry; admin deactivation ends all sessions |
| Malicious upload | Type from bytes, size limit, never executed, random names, nosniff |
| Script injection in notes or titles | React escaping, CSP, escaped emails |
| Laptop lost | Disk encryption (FileVault) on; database password and session secret rotated |

## Data handling
- Held: names, work emails, time zones, activity counts, notes, screenshots.
- Locally: on this computer only. Turn on FileVault.
- Retention: 24 months, then delete (a job to add after go-live).
- Team guidance: crop screenshots to the numbers; never upload CVs or client contracts as proof.
- Whether this meets UAE, KSA, UK or India data protection rules should be confirmed with whoever
  handles data protection for Yallo Group. This is not legal advice.
