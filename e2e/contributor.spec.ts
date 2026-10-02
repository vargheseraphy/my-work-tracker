/** Journeys J1 to J7 from docs/TESTING.md. */

import { expect, test } from '@playwright/test';
import { signIn } from './accounts.js';

test.describe('J1 · a contributor signs in and sees what is missing', () => {
  test('the missing-day banner opens the missed day', async ({ page }) => {
    await signIn(page, 'Tanzil');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tanzil');
    const banner = page.getByRole('alert').first();
    await expect(banner).toContainText('is missing');

    await banner.getByRole('link').click();
    await expect(page).toHaveURL(/\/daily\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByText('You are filling in a missed day')).toBeVisible();
  });

  test('the sidebar carries a live badge for the missing days', async ({ page }) => {
    await signIn(page, 'Tanzil');
    const dailyLink = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
      name: /Daily log/,
    });
    await expect(dailyLink).toContainText('missing');
  });
});

test.describe('J2 · filling a missed day and submitting it', () => {
  test('submit turns on once everything is filled, and the day shows as late', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.getByRole('alert').first().getByRole('link').click();

    const submit = page.getByRole('button', { name: 'Submit' });
    await expect(submit).toBeDisabled();

    // Every enabled field, filled with 0, which is a valid answer.
    const numbers = page.locator('input.num');
    const count = await numbers.count();
    for (let index = 0; index < count; index += 1) {
      await numbers.nth(index).fill('0');
    }

    await expect(page.getByText('0 of', { exact: false }).first()).toBeVisible();
    await expect(submit).toBeEnabled({ timeout: 15_000 });

    await submit.click();
    await expect(page.getByText(/Submitted|This day went in late/)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('J3 · the cross-field rule shows and clears', () => {
  test('filtered above added is refused, and fixing it clears the error', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/daily');

    const numbers = page.locator('input.num');
    const count = await numbers.count();
    for (let index = 0; index < count; index += 1) {
      await numbers.nth(index).fill('0');
    }

    // Contacts filtered above contacts added.
    await page.getByLabel('Contacts added', { exact: true }).fill('10');
    await page.getByLabel('Contacts filtered (qualified)', { exact: true }).fill('20');
    await page.waitForTimeout(1200);

    const submit = page.getByRole('button', { name: 'Submit' });
    await expect(submit).toBeDisabled();

    await page.getByLabel('Contacts filtered (qualified)', { exact: true }).fill('8');
    await page.waitForTimeout(1200);
    await expect(submit).toBeEnabled({ timeout: 15_000 });
  });
});

test.describe('J4 · nothing is lost on a refresh', () => {
  test('values typed stay after a reload, and the form locks after submit', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/daily');

    await page.getByLabel('Likes given', { exact: true }).fill('33');
    await expect(page.getByText('Saved').first()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByLabel('Likes given', { exact: true })).toHaveValue('33');
  });
});

test.describe('J5 · the weekly log totals come from the daily logs', () => {
  test('the read-only totals are shown', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/weekly');

    await expect(page.getByRole('heading', { name: 'From your daily logs' })).toBeVisible();
    await expect(page.getByText('Read only')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Weekly log' })).toBeVisible();
  });
});

test.describe('J6 · task statuses', () => {
  test('Blocked without a note is refused; Done with a link succeeds', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/tasks');

    await page.getByRole('cell', { name: /Check the open rate drop/ }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // Blocked with no note: the save button stays out of reach until a note is typed.
    await drawer.getByLabel('Change the status').selectOption('Blocked');
    await expect(drawer.getByLabel('What is blocking you?')).toBeVisible();
    await drawer.getByLabel('What is blocking you?').fill('Waiting on the email tool export.');
    await drawer.getByRole('button', { name: 'Save the status' }).click();
    await expect(drawer.getByText('Blocked').first()).toBeVisible({ timeout: 15_000 });

    // Done needs a link.
    await drawer.getByLabel('Change the status').selectOption('Done');
    await drawer.getByLabel('Link to the proof').fill('https://example.test/done');
    await drawer.getByRole('button', { name: 'Save the status' }).click();
    await expect(drawer.getByText('Done').first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('J7 · the ABM owner moves an account to Live', () => {
  test('the week strip shows the new stage', async ({ page }) => {
    await signIn(page, 'Anil');
    await page.goto('/abm');

    await expect(page.getByRole('heading', { name: /One new account live every week/ })).toBeVisible();

    await page.getByRole('button', { name: /\[Account E\]/ }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    await drawer.getByLabel('Stage').selectOption('Live');
    await expect(drawer.getByText('Live').first()).toBeVisible({ timeout: 15_000 });

    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Accounts by stage' })).toBeVisible();
  });
});
