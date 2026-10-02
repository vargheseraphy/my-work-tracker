/** Usable at 390 px (docs/TECH_SPEC.md "Devices"), with no sideways scrolling. */

import { expect, test } from '@playwright/test';
import { signIn } from './accounts.js';

/** A weekday a few days back: the seed has filled it in for every contributor. */
function aPastWorkingDay(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 3);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

test.describe('narrow screens', () => {
  test('the sidebar becomes a top bar and the page does not scroll sideways', async ({ page }) => {
    test.skip(page.viewportSize()!.width > 500, 'This is the narrow-screen run');

    await signIn(page, 'Tanzil');

    for (const path of ['/', '/daily', '/weekly', '/tasks', '/abm']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the daily log form stacks, and the progress panel moves below it', async ({ page }) => {
    test.skip(page.viewportSize()!.width > 500, 'This is the narrow-screen run');

    await signIn(page, 'Tanzil');
    // A day already logged, so the form and its panel are both on screen whatever the weekday.
    await page.goto(`/daily/${aPastWorkingDay()}`);

    const form = page.locator('.col-main');
    const aside = page.locator('aside').last();
    const formBox = await form.boundingBox();
    const asideBox = await aside.boundingBox();

    expect(formBox).not.toBeNull();
    expect(asideBox).not.toBeNull();
    expect(asideBox!.y).toBeGreaterThan(formBox!.y);
  });
});
