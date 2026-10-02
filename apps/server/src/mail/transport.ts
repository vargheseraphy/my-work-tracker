/**
 * SMTP through nodemailer, configured entirely from .env (docs/EMAIL.md).
 * Locally everything goes to Mailpit on :1025 and nothing leaves the computer.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | undefined;

export function getTransport(): Transporter {
  if (!transporter) {
    const cfg = config();
    transporter = nodemailer.createTransport({
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      // Mailpit accepts anything; a real provider needs the user and password from .env.
      auth: cfg.SMTP_USER ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
      tls: { rejectUnauthorized: cfg.isProduction },
    });
  }
  return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
  const cfg = config();
  await getTransport().sendMail({
    from: cfg.EMAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

export function resetTransport(): void {
  transporter?.close?.();
  transporter = undefined;
}
