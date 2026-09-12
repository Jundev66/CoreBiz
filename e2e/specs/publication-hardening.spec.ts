import { test, expect } from '@playwright/test';
import { POSTGRES, signIn } from '../session';

/**
 * Controls added before the repository went public, seen from the browser.
 *
 * The database-level controls (template lock, ownership rules) are covered by
 * `packages/infrastructure/tests/publication-hardening.integration.test.ts`.
 */

test('a signed-in session alone cannot set a new password', async ({ page }) => {
  test.skip(!POSTGRES, 'requires Supabase: run with E2E_DRIVER=postgres');

  /*
   * The new-password form used to accept any session, so a stolen cookie or a shared
   * computer left signed in became a permanent account takeover. It now requires proof
   * that this browser came through the recovery email for this user.
   *
   * The "new" password is deliberately the one the account already has: if this guard
   * ever regresses, the rest of the suite can still sign in.
   */
  await signIn(page);
  await page.goto('/reset-password');

  await page.getByLabel(/nueva contraseña|new password/i).fill('corebiz-demo');
  await page.getByRole('button', { name: /guardar la contraseña|save the password/i }).click();

  await expect(page.getByText(/el enlace caducó|the link expired/i)).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password/);
});
