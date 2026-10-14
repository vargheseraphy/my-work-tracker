/**
 * One plain layout for every email (docs/EMAIL.md section 3):
 * white card, 3 px accent top bar, ink text, one ink button, a footer saying why the person
 * received it. Every value is escaped. No images and no tracking pixels.
 *
 * Colours are literal hex, not tokens: email clients do not support CSS custom properties.
 * They mirror the light theme in design/brand-theme. Keep them in step by hand.
 */

import { config } from '../config.js';
import type { Mail } from './transport.js';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutInput {
  title: string;
  body: string;
  buttonLabel?: string;
  buttonUrl?: string;
  footer: string;
}

/** Only http(s) links are ever put in a button. */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function layout(input: LayoutInput): { html: string; text: string } {
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body).replace(/\n/g, '<br />');
  const footer = escapeHtml(input.footer);
  const url = input.buttonUrl ? safeUrl(input.buttonUrl) : null;

  const button =
    url && input.buttonLabel
      ? `<tr><td style="padding:8px 32px 28px">
           <a href="${escapeHtml(url)}"
              style="display:inline-block;background:#0B1424;color:#F5F4FA;text-decoration:none;
                     padding:11px 20px;border-radius:4px;font-size:14px;font-weight:600">
             ${escapeHtml(input.buttonLabel)}
           </a>
         </td></tr>`
      : '';

  const html = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8" /><title>${title}</title></head>
<body style="margin:0;padding:24px;background:#F5F4FA;
             font-family:'Segoe UI','Noto Sans',system-ui,-apple-system,sans-serif;color:#0B1424">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #D5D8E3;border-radius:10px">
    <tr><td style="height:3px;background:#4B3FD1;border-radius:10px 10px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:28px 32px 4px">
      <h1 style="margin:0;font-size:19px;line-height:1.35;font-weight:700">${title}</h1>
    </td></tr>
    <tr><td style="padding:10px 32px 20px;font-size:14px;line-height:1.6;color:#1B2A44">${body}</td></tr>
    ${button}
    <tr><td style="padding:16px 32px 24px;border-top:1px solid #D5D8E3;font-size:12px;line-height:1.5;color:#34415A">
      Repotra<br />${footer}
    </td></tr>
  </table>
</body></html>`;

  const text = [
    input.title,
    '',
    input.body,
    url ? `\n${input.buttonLabel}: ${url}` : '',
    '',
    '—',
    'Repotra',
    input.footer,
  ]
    .filter((line) => line !== null)
    .join('\n');

  return { html, text };
}

/** A reminder or in-app notification sent on by the jobs runner. */
export function notificationEmail(input: {
  to: string;
  fullName: string;
  title: string;
  body: string;
  link: string | null;
}): Mail {
  const cfg = config();
  const url = input.link ? `${cfg.APP_URL}${input.link}` : cfg.APP_URL;
  const { html, text } = layout({
    title: input.title,
    body: `${input.fullName}, ${lowerFirst(input.body)}`,
    buttonLabel: 'Open the tracker',
    buttonUrl: url,
    footer: 'You received this because you log GTM activity in the tracker.',
  });
  return { to: input.to, subject: input.title, html, text };
}

export function invitePasswordEmail(to: string, fullName: string, link: string): Mail {
  const { html, text } = layout({
    title: 'Set your password for Repotra',
    body: `${fullName}, your account is ready. Choose a password to sign in. The link works for 48 hours.`,
    buttonLabel: 'Set your password',
    buttonUrl: link,
    footer: 'You received this because an admin invited you to the tracker.',
  });
  return { to, subject: 'Set your password for Repotra', html, text };
}

export function resetPasswordEmail(to: string, link: string): Mail {
  const { html, text } = layout({
    title: 'Reset your password',
    body: 'Use the button below to choose a new password. The link works for one hour. If you did not ask for this, nothing has changed and you can ignore this email.',
    buttonLabel: 'Choose a new password',
    buttonUrl: link,
    footer: 'You received this because someone asked to reset the password for this address.',
  });
  return { to, subject: 'Reset your password', html, text };
}

export function weeklyReportEmail(input: {
  to: string;
  monday: string;
  range: string;
  lines: string[];
}): Mail {
  const { html, text } = layout({
    title: `GTM report, week of ${input.range}`,
    body: input.lines.join('\n'),
    buttonLabel: 'Open the full report',
    buttonUrl: `${config().APP_URL}/report/${input.monday}`,
    footer: 'You received this because you are listed as a report recipient in Settings.',
  });
  return { to: input.to, subject: `GTM report, week of ${input.range}`, html, text };
}

function lowerFirst(value: string): string {
  if (value.length === 0) return value;
  // Keep acronyms and names as they are.
  if (value.slice(0, 2) !== value.slice(0, 2).toUpperCase()) {
    return value.charAt(0).toLowerCase() + value.slice(1);
  }
  return value;
}
