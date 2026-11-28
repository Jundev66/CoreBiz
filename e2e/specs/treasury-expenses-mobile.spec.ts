import { expect, test } from '@playwright/test';

test.describe('Tesorería, Logística, Facturación y PWA Móvil', () => {
  test('flujo de usuario por formularios: tesorería swap, gastos logísticos, facturación y movimientos', async ({
    page,
  }) => {
    await page.goto('/invoicing');
    await expect(page.getByRole('heading', { name: 'Facturas de Venta' })).toBeVisible();

    await page.goto('/accounting/treasury');
    await expect(
      page.getByRole('heading', { name: /Tesorería & Adquisición de Activos/i }),
    ).toBeVisible();

    await page.locator('select[name="sourceCurrency"]').selectOption('USD');
    await page.locator('input[name="sourceAmount"]').fill('100.00');
    await page.locator('select[name="targetCurrency"]').selectOption('USD');
    await page.locator('input[name="targetAmount"]').fill('98.00');
    await page.locator('input[name="exchangeRate"]').fill('1.00');
    await page.locator('input[name="feeAmount"]').fill('2.00');
    await page.locator('input[name="counterpartyReference"]').fill('E2E-SWAP-001');

    await page.getByRole('button', { name: 'Ejecutar y Asentar Swap' }).click();
    await expect(page).toHaveURL(/\/accounting\/treasury$/);

    await page.goto('/accounting/expenses');
    await expect(
      page.getByRole('heading', { name: /Gastos Operativos, Logística & Desembolsos/i }),
    ).toBeVisible();

    await page.locator('input[name="beneficiary"]').fill('Transporte Demo E2E C.A.');
    await page.locator('input[name="taxId"]').fill('J-40112233-9');
    await page.locator('input[name="receiptNumber"]').fill('FLETE-E2E-01');
    await page.locator('input[name="amount"]').fill('25.00');
    await page.locator('input[name="notes"]').fill('Flete de prueba E2E');

    await page.getByRole('button', { name: /Registrar Egreso/i }).click();
    await expect(page).toHaveURL(/\/accounting\/expenses/);
    await expect(page.getByText('Transporte Demo E2E C.A.')).toBeVisible();
  });

  test('PWA móvil 375x667: menú lateral móvil abre grupos y no hay desborde horizontal', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/accounting/treasury');

    const overflow = await page
      .locator('html')
      .evaluate(
        (el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth > el.clientWidth,
      );
    expect(overflow).toBe(false);

    await page.getByRole('button', { name: 'Abrir menú de módulos' }).click();
    const dialog = page.getByRole('dialog', { name: 'Menú de módulos' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Contabilidad')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Abrir Terminal POS/i })).toBeVisible();
  });
});
