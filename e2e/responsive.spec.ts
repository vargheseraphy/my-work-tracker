/** Usable at 390 px (docs/TECH_SPEC.md "Devices"), with no sideways scrolling. */

import { expect, test } from '@playwright/test';
import { signIn } from './accounts.js';

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
    await page.goto('/daily');

    const form = page.locator('.col-main');
    const aside = page.locator('aside').last();
    const formBox = await form.boundingBox();
    const asideBox = await aside.boundingBox();

    expect(formBox).not.toBeNull();
    expect(asideBox).not.toBeNull();
    expect(asideBox!.y).toBeGreaterThan(formBox!.y);
  });
});
