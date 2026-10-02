/**
 * BUILD.md phase 8, item 3: screenshot each built screen and its prototype at 1440 px into
 * test-results/visual/, so the two can be compared by eye. Nothing here fails a run; the
 * remaining differences are listed in docs/progress.md.
 *
 *   npx playwright test --project=desktop e2e/visual.spec.ts
 */

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { signIn } from './accounts.js';

const OUT = resolve(process.cwd(), 'test-results/visual');

const SCREENS: { name: string; path: string; prototype: string; as: 'Tanzil' | 'Raphy' }[] = [
  { name: '02-home', path: '/', prototype: 'home.html', as: 'Tanzil' },
  { name: '03-daily-log', path: '/daily', prototype: 'daily-log.html', as: 'Tanzil' },
  { name: '04-weekly-log', path: '/weekly', prototype: 'weekly-log.html', as: 'Tanzil' },
  { name: '05-my-tasks', path: '/tasks', prototype: 'my-tasks.html', as: 'Tanzil' },
  { name: '06-abm-tracker', path: '/abm', prototype: 'abm-tracker.html', as: 'Tanzil' },
  { name: '07-dashboard', path: '/admin', prototype: 'dashboard.html', as: 'Raphy' },
  { name: '09-task-management', path: '/admin/tasks', prototype: 'task-management.html', as: 'Raphy' },
  { name: '10-settings', path: '/admin/settings', prototype: 'settings.html', as: 'Raphy' },
  { name: '11-calendar', path: '/admin/calendar', prototype: 'calendar.html', as: 'Raphy' },
  { name: '12-weekly-report', path: '/report', prototype: 'weekly-report.html', as: 'Raphy' },
];

test.describe('visual comparison', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'Full width only');

  test('capture every screen beside its prototype', async ({ page }) => {
    test.setTimeout(180_000);
    await mkdir(OUT, { recursive: true });

    // The prototypes first: plain files, no sign-in needed.
    for (const screen of SCREENS) {
      const url = pathToFileURL(resolve(process.cwd(), 'design', screen.prototype)).toString();
      await page.goto(url);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${screen.name}-prototype.png`, fullPage: true });
    }

    for (const who of ['Tanzil', 'Raphy'] as const) {
      await signIn(page, who);
      for (const screen of SCREENS.filter((s) => s.as === who)) {
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${OUT}/${screen.name}-built.png`, fullPage: true });
      }
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/signin$/);
    }

    // Sign in is its own pair: the built page replaces the prototype's social buttons.
    await page.goto(pathToFileURL(resolve(process.cwd(), 'design/signin.html')).toString());
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/01-signin-prototype.png`, fullPage: true });
    await page.goto('/signin');
    await page.screenshot({ path: `${OUT}/01-signin-built.png`, fullPage: true });
  });
});
