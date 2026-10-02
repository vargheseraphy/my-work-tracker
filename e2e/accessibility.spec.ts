/**
 * axe on every screen, at 1440x900 and 390x844 (docs/TESTING.md, BUILD.md phase 8).
 * Serious and critical issues fail the run.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { signIn } from './accounts.js';

async function check(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  const summary = serious
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}) on ${violation.nodes.length} element(s): ${violation.help}`,
    )
    .join('\n');

  expect(serious, `${name} has serious or critical accessibility problems:\n${summary}`).toEqual([]);
}

test.describe('public screens', () => {
  test('sign in', async ({ page }) => {
    await page.goto('/signin');
    await check(page, 'Sign in');
  });

  test('forgotten password', async ({ page }) => {
    await page.goto('/forgot');
    await check(page, 'Forgotten password');
  });
});

test.describe('contributor screens', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'Tanzil');
  });

  for (const [name, path] of [
    ['Home', '/'],
    ['Daily log', '/daily'],
    ['Weekly log', '/weekly'],
    ['My tasks', '/tasks'],
    ['ABM tracker', '/abm'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await check(page, name);
    });
  }
});

test.describe('manager screens', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'Raphy');
  });

  for (const [name, path] of [
    ['Dashboard', '/admin'],
    ['People', '/people'],
    ['Task management', '/admin/tasks'],
    ['Targets and fields', '/admin/settings'],
    ['Holidays and leave', '/admin/calendar'],
    ['Weekly report', '/report'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await check(page, name);
    });
  }

  test('Person detail', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('cell', { name: 'Tanzil', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tanzil' })).toBeVisible();
    await check(page, 'Person detail');
  });
});
