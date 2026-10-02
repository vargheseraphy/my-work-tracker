/** Journeys J8 to J12 from docs/TESTING.md. */

import { expect, test } from '@playwright/test';
import { account, signIn, signOut } from './accounts.js';

test.describe('J8 · the admin dashboard', () => {
  test('the grid shows a late day, and targets show pace in words', async ({ page }) => {
    await signIn(page, 'Raphy');

    await expect(page.getByRole('heading', { name: 'GTM dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Daily sign-off' })).toBeVisible();

    // The seed makes two of Anil's days late.
    await expect(page.getByTitle(/Late$/).first()).toBeVisible();

    // Status is never colour alone: the word is there too.
    await expect(page.getByText(/On pace|Close|Behind|No target/).first()).toBeVisible();
    await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible();
  });

  test('a viewer reads the dashboard but gets no admin menu', async ({ page }) => {
    await signIn(page, 'Leadership');
    await expect(page.getByRole('heading', { name: 'GTM dashboard' })).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Task management' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Targets and fields' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });
});

test.describe('J9 · an admin unlocks a day', () => {
  test('the contributor is told, and can edit again', async ({ page }) => {
    await signIn(page, 'Raphy');
    await page.goto('/people');
    await page.getByRole('cell', { name: 'Tanzil', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Tanzil' })).toBeVisible();
    await page.getByRole('button', { name: 'Unlock' }).first().click();

    const modal = page.getByRole('dialog');
    await modal.getByLabel('Reason').fill('The email count looked wrong.');
    await modal.getByRole('button', { name: 'Unlock the entry' }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await signOut(page);
    await signIn(page, 'Tanzil');

    await page.getByRole('button', { name: /Notifications/ }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(/was unlocked/)).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText('Reason: The email count looked wrong.')).toBeVisible();
  });
});

test.describe('J10 · an admin creates a task', () => {
  test('the contributor sees it on home and in the daily log', async ({ page }) => {
    await signIn(page, 'Raphy');
    await page.goto('/admin/tasks');

    await page.getByRole('button', { name: 'New task' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Title').fill('Check the webinar landing page');
    await modal.getByLabel('Assignee').selectOption({ label: 'Tanzil' });

    // Due today, so it has to be updated before today can be signed off.
    const today = new Date().toISOString().slice(0, 10);
    await modal.getByLabel('Due date').fill(today);
    await modal.getByRole('button', { name: 'Create the task' }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await signOut(page);
    await signIn(page, 'Tanzil');

    await expect(
      page.getByText('Check the webinar landing page').first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto('/tasks');
    await expect(page.getByText('Check the webinar landing page')).toBeVisible();
  });
});

test.describe('J11 · an admin turns a field off for one person', () => {
  test('it disappears from that person’s next log, and stays for everyone else', async ({ page }) => {
    await signIn(page, 'Raphy');
    await page.goto('/admin/settings');
    await page.getByRole('tab', { name: 'Fields' }).click();

    const row = page.getByRole('row', { name: /Posters created/ });
    await expect(row).toBeVisible();
    await row.getByLabel('Posters created for Tanzil').uncheck();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible({
      timeout: 15_000,
    });

    await signOut(page);
    await signIn(page, 'Tanzil');
    await page.goto('/daily');
    await expect(page.getByText('Posters created')).toHaveCount(0);

    await signOut(page);
    await signIn(page, 'Tamre');
    await page.goto('/daily');
    await expect(page.getByText('Posters created')).toBeVisible();
  });
});

test.describe('J12 · an admin marks a holiday', () => {
  test('that day stops showing as missing', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/');
    const banner = page.getByRole('alert').first();
    await expect(banner).toContainText('is missing');
    const missingDay = await banner
      .getByRole('link')
      .getAttribute('href')
      .then((href) => href!.split('/').pop()!);

    await signOut(page);
    await signIn(page, 'Raphy');
    await page.goto('/admin/calendar');

    // The calendar page opens on the current month; the missing day is in it.
    const dayNumber = missingDay.slice(8).replace(/^0/, '');
    await page.getByRole('button', { name: new RegExp(`^.* ${dayNumber} .*, add a holiday`) }).click();

    const modal = page.getByRole('dialog');
    await modal.getByLabel('Label').fill('Founders day');
    await modal.getByRole('button', { name: 'Add it' }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    await signOut(page);
    await signIn(page, 'Tanzil');
    await page.goto('/');
    await expect(page.getByRole('alert').first()).not.toContainText(dayNumber);
  });
});

test.describe('the weekly report', () => {
  test('builds, and offers the CSV export', async ({ page }) => {
    await signIn(page, 'Raphy');
    await page.goto('/report');

    await expect(page.getByRole('heading', { name: 'GTM weekly report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The week in numbers' })).toBeVisible();
    await expect(page.getByRole('link', { name: /CSV/ })).toBeVisible();
  });
});

test.describe('access', () => {
  test('a contributor is sent away from the admin pages', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/$/);
  });

  test('signing out ends the session', async ({ page }) => {
    await signIn(page, 'Tanzil');
    await signOut(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin$/);
  });

  test('a wrong password is refused with one message', async ({ page }) => {
    const login = account('Tanzil');
    await page.goto('/signin');
    await page.getByLabel('Email address').fill(login.email);
    await page.getByLabel('Password').fill('definitely-not-it');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Check your email address and password');
  });
});
