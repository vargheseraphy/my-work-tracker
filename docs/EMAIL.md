# Email

The server sends three kinds of email: reminders, invites and password resets, and the Monday
report. It uses SMTP through nodemailer, so you can switch providers by changing `.env` only.

## 1. Local testing (default): Mailpit
- `docker compose up -d` starts Mailpit.
- The app sends to `localhost:1025`; nothing leaves your computer.
- See every email at **http://localhost:8025**. Tests read `http://localhost:8025/api/v1/messages`.

## 2. Real email from your computer
Yes, the app can email the team from your laptop. Reminders only go out while the computer is on and
`npm run dev` (or `npm start`) is running. If the computer was asleep, reminders due in the last
3 hours go out when it wakes.

Pick one provider, put its values in `.env`, restart the server, then run `npm run jobs:run-now`
and check that the email arrives.

| Option | SMTP_HOST | SMTP_PORT / SMTP_SECURE | SMTP_USER | SMTP_PASS | Notes |
| --- | --- | --- | --- | --- | --- |
| **Resend (recommended)** | smtp.resend.com | 465 / true | resend | your Resend API key | Free plan 3,000 emails a month, 100 a day (checked 29 Sep 2026). Needs a verified sending domain such as notify.yallo.co (DNS records from whoever manages yallo.co). |
| Google Workspace account | smtp.gmail.com | 465 / true | the full address | an app password | Needs 2-Step Verification and app passwords allowed by the Workspace admin. |
| Microsoft 365 mailbox | smtp.office365.com | 587 / false (STARTTLS) | the full address | the mailbox password | SMTP AUTH must be switched on for the mailbox. Microsoft is retiring basic authentication for SMTP AUTH by default from the end of December 2026, so do not rely on this option. |

Set `EMAIL_FROM` to the sending address, for example `Yallo GTM <gtm@notify.yallo.co>`.
Check each provider's current documentation before switching; settings change.

## 3. Templates
- One plain layout: white background, 3 px gold top bar, black text, one black button, footer with
  "Yallo GTM tracker" and why the person received it.
- Subject = the notification title. Body = the notification body plus a button to `APP_URL` + link.
- Always send a text version too.
- Escape every value. No images, no tracking pixels.

## 4. Volume
Four people, at most about six reminders each per working day, plus one report: well under 100 a day.
