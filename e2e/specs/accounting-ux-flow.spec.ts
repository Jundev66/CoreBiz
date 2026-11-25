import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Chart of Accounts Tree, Flow Mapping, Item Accounts & Modern Shell', () => {
  test.beforeEach(async ({ page, context }) => {
    await signIn(page);
    await page.addInitScript(() => {
      localStorage.setItem('corebiz_cookie_consent', 'accepted');
    });
    await context.addCookies([
      {
        name: 'corebiz_active_tenant',
        value: '00000000-0000-0000-0000-0000000000t1',
        url: 'http://localhost:3210',
      },
      { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
    ]);
  });

  test('creates branched sub-account, assigns it in company flow mapping, and edits accounts in product detail', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/accounting');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/plan de cuentas/i);
    await expect(page.getByText(/venezuela · seniat/i)).toBeVisible();
    await expect(page.locator('#navbar-tenantId')).toBeVisible();
    await expect(page.getByLabel('Usuario y cuenta')).toBeVisible();
    await expect(page.getByLabel('Filtrar navegación')).toBeVisible();

    const subButton = page.getByRole('button', { name: /\+ subcuenta/i }).first();
    await expect(subButton).toBeVisible();
    await subButton.click();

    await expect(page.getByRole('heading', { name: /nueva cuenta contable/i })).toBeVisible();
    const ts = Date.now().toString().slice(-3);
    const subCode = `1.1.01.${ts}`;
    const subName = `Banco QA ${ts}`;

    await page.locator('input[name="code"]').fill(subCode);
    await page.locator('input[name="name"]').fill(subName);
    await page.getByRole('button', { name: /crear cuenta/i }).click();

    await expect(page.getByText(subName, { exact: true })).toBeVisible();

    await page.goto('/settings/accounting');
    const cashSelect = page.locator('select[name="cashAccountId"]');
    const createdOption = cashSelect.locator('option', { hasText: subName });
    await expect(createdOption).toHaveCount(1);
    const optVal = await createdOption.getAttribute('value');
    await cashSelect.selectOption(optVal);
    await page.getByRole('button', { name: /guardar cuentas por flujo/i }).click();
    await expect(page.getByText(/configuración contable por flujo guardada/i)).toBeVisible();

    await page.reload();
    await expect(page.locator('select[name="cashAccountId"]')).toHaveValue(optVal!);

    await page.goto('/products');
    const firstProductLink = page.locator('table tbody tr td a').first();
    await firstProductLink.click();
    await expect(page).toHaveURL(/\/products\/.+/);

    await expect(page.getByRole('heading', { name: /cuentas contables del ítem/i })).toBeVisible();
    const revSelect = page.locator('select[name="revenueAccountId"]');
    const revOpt = await revSelect.locator('option').nth(1).getAttribute('value');
    if (revOpt) {
      await revSelect.selectOption(revOpt);
    }
    await page.getByRole('button', { name: /guardar cuentas del ítem/i }).click();
    await expect(page.getByText(/cuentas contables del ítem actualizadas/i)).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });
});
