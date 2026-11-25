import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Chart of Accounts Tree, Flow Mapping, Item Accounts/Tax, Stock Accounting & Modern Shell', () => {
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

  test('navigates circular rail sidebar, creates root & subaccount, configures item tax & stock adjustment journal, and verifies POS sync', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/accounting');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/plan de cuentas/i);
    await expect(page.getByText(/venezuela · seniat/i)).toBeVisible();
    await expect(page.locator('#navbar-tenantId')).toBeVisible();
    await expect(page.getByLabel('Usuario y cuenta')).toBeVisible();

    await expect(page.getByRole('tab', { name: 'Ventas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Facturas de Venta' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Ventas' }).click();
    await expect(page.getByRole('link', { name: 'Facturas de Venta' })).toBeVisible();

    const navSearch = page.getByLabel('Filtrar navegación');
    await navSearch.fill('Libro Diario');
    await expect(
      page
        .getByRole('navigation', { name: 'Resultados de módulos' })
        .getByRole('link', { name: /libro diario/i }),
    ).toBeVisible();
    await navSearch.fill('');
    await page.getByRole('tab', { name: 'Contabilidad' }).click();

    const ts = Date.now().toString().slice(-3);
    const rootCode = `1.9.${ts}`;
    const rootName = `Activos QA ${ts}`;

    await page.getByRole('button', { name: /nueva cuenta/i }).click();
    await expect(page.getByRole('heading', { name: /nueva cuenta contable/i })).toBeVisible();
    await page.locator('input[name="code"]').fill(rootCode);
    await page.locator('input[name="name"]').fill(rootName);
    await page.getByRole('button', { name: /crear cuenta/i }).click();
    await expect(page.getByText(rootName, { exact: true })).toBeVisible();

    const subButton = page.getByRole('button', { name: /\+ subcuenta/i }).first();
    await expect(subButton).toBeVisible();
    await subButton.click();

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
    const configuredProductId = page.url().split('/').pop()!;

    await expect(
      page.getByRole('heading', { name: /contabilidad e impuesto del ítem/i }),
    ).toBeVisible();
    const revSelect = page.locator('select[name="revenueAccountId"]');
    const revOpt = await revSelect.locator('option').nth(1).getAttribute('value');
    if (revOpt) {
      await revSelect.selectOption(revOpt);
    }
    await page.locator('select[name="taxPercentage"]').selectOption('0');
    await page.getByRole('button', { name: /guardar configuración del ítem/i }).click();
    await expect(
      page.getByText(/configuración contable y fiscal del ítem actualizada/i),
    ).toBeVisible();

    await page.locator('input[name="newBalance"]').fill('50');
    await page.locator('input[name="reason"]').fill(`Conteo QA ${ts}`);
    await page.getByRole('button', { name: /guardar el ajuste/i }).click();
    await expect(page.getByText(`Conteo QA ${ts}`)).toBeVisible();

    await page.goto('/accounting/journal-entries');
    await expect(page.getByText(new RegExp(`Conteo QA ${ts}`)).first()).toBeVisible();

    await page.goto('/invoicing/new');
    const productSelect = page.locator('select[name="line-product"]').first();
    await productSelect.selectOption(configuredProductId);
    const lineTax = page.locator('select[name="line-tax"]').first();
    if ((await lineTax.count()) > 0) {
      await expect(lineTax).toHaveValue('0');
    }

    expect(pageErrors).toHaveLength(0);
  });
});
