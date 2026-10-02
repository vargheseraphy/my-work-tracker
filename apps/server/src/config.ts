/**
 * Every setting comes from .env and is validated here. The server refuses to start when something
 * required is missing, when SESSION_SECRET is too short, or when DATABASE_URL uses the owner role
 * (docs/TECH_SPEC.md section 8, docs/SECURITY.md "Secrets").
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  DATABASE_URL_OWNER: z.string().min(1).optional(),
  DATABASE_URL_OWNER_TEST: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_IDLE_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  UPLOAD_DIR: z.string().min(1).default('./data/uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(5_242_880),

  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().min(1).default('Yallo GTM <gtm-tracker@localhost>'),

  JOBS_ENABLED: bool.default(true),
  REMINDER_CRON: z.string().min(1).default('*/15 * * * *'),
  REPORT_CRON: z.string().min(1).default('0 9 * * 1'),
  REPORT_TIMEZONE: z.string().min(1).default('Asia/Kolkata'),

  /** Auth requests allowed per IP per 15 minutes (docs/TECH_SPEC.md "Auth"). */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).max(100_000).default(20),

  ALLOWED_EMAIL_DOMAINS: z.string().default(''),
  INVITE_TOKEN_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(48),
  RESET_TOKEN_HOURS: z.coerce.number().int().min(1).max(72).default(1),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type RawConfig = z.infer<typeof schema>;

export interface Config extends RawConfig {
  /** The connection string the server pool uses: the test database under NODE_ENV=test. */
  databaseUrl: string;
  /** Domains an invite address must end with. Empty means any domain is allowed. */
  allowedEmailDomains: string[];
  uploadDir: string;
  isProduction: boolean;
  isTest: boolean;
}

/** Reads .env without overwriting anything already set in the environment. */
export function loadDotEnv(dir = process.cwd()): void {
  for (const name of ['.env']) {
    let text: string;
    try {
      text = readFileSync(resolve(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const key = match[1]!;
      if (process.env[key] !== undefined) continue;
      let value = match[2]!.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function roleOf(connectionString: string): string {
  try {
    return decodeURIComponent(new URL(connectionString).username);
  } catch {
    return '';
  }
}

export function buildConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`The server cannot start. Check .env:\n${problems}`);
  }
  const raw = parsed.data;
  const isTest = raw.NODE_ENV === 'test';
  const databaseUrl = isTest ? (raw.DATABASE_URL_TEST ?? raw.DATABASE_URL) : raw.DATABASE_URL;

  // The app must never connect as the role that owns the schema (docs/DATABASE.md "Roles").
  const role = roleOf(databaseUrl);
  if (role === '' || /owner/i.test(role)) {
    throw new Error(
      `The server cannot start: DATABASE_URL must use the application role (gtm_app), not "${role || 'an unnamed role'}".`,
    );
  }

  return {
    ...raw,
    databaseUrl,
    allowedEmailDomains: raw.ALLOWED_EMAIL_DOMAINS.split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    uploadDir: resolve(process.cwd(), raw.UPLOAD_DIR),
    isProduction: raw.NODE_ENV === 'production',
    isTest,
  };
}

let cached: Config | undefined;

export function config(): Config {
  if (!cached) cached = buildConfig();
  return cached;
}

/** Only tests should need this. */
export function resetConfig(): void {
  cached = undefined;
}
