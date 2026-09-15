import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from '../session';

/**
 * The dark theme.
 *
 * The smoke suite already runs axe on the light theme. The dark one gets the same run of its
 * own: every colour is defined twice, and a token that passes in one theme says nothing
 * about its twin.
 */

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test('the switch changes the theme and the choice survives a reload', async ({ page }) => {
  await page.goto('/customers');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: /modo oscuro|dark mode/i }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // Still on the same screen: switching theme is not a navigation.
  await expect(page).toHaveURL(/\/customers$/);

  await page.getByRole('button', { name: /modo claro|light mode/i }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});

test.describe('Accessibility in the dark theme', () => {
  for (const path of [
    '/',
    '/customers',
    '/customers/new',
    '/settings/team',
    '/purchases',
    '/login',
  ]) {
    test(`no serious violations on ${path}`, async ({ page, context, baseURL }) => {
      const url = new URL(baseURL ?? 'http://localhost:3000');
      await context.addCookies([
        { name: 'corebiz_theme', value: 'dark', domain: url.hostname, path: '/' },
      ]);

      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );

      expect(
        serious,
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`).join('\n'),
      ).toEqual([]);
    });
  }
});
