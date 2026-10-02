/** The invented seed logins, read from the git-ignored file the seed writes. */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

export interface SeedLogin {
  role: string;
  email: string;
  password: string;
}

export function accounts(): SeedLogin[] {
  const path = resolve(process.cwd(), 'data/seed-accounts.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SeedLogin[];
  } catch {
    throw new Error(
      'data/seed-accounts.json is missing. Run "npm run db:reset" and try the browser journeys again.',
    );
  }
}

export function account(name: 'Raphy' | 'Tanzil' | 'Anil' | 'Tamre' | 'Leadership'): SeedLogin {
  const found = accounts().find((a) => a.role === name);
  if (!found) throw new Error(`No seeded account called ${name}`);
  return found;
}

export async function signIn(page: Page, name: Parameters<typeof account>[0]): Promise<void> {
  const login = account(name);
  await page.goto('/signin');
  await page.getByLabel('Email address').fill(login.email);
  await page.getByLabel('Password').fill(login.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin$/);
}
