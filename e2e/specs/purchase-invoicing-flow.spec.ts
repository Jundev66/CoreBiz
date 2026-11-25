import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Purchase Invoicing Flow, Libro de Compras & Dual-Ledger FX', () => {
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

  test('registers a CREDIT USD purchase invoice with FX rates and reflects in Libro de Compras and CxP Aging', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/purchases');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/facturas de compra/i);

    await page
      .getByRole('link', { name: /nueva factura de compra/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/purchases\/new$/);

    const ts = Date.now().toString().slice(-4);
    const invNum = `FAC-PROV-${ts}`;
    const ctrlNum = `00-99${ts}`;

    const supplierSelect = page.locator('select[name="supplierId"]');
    const firstSupplierVal = await supplierSelect.locator('option').nth(1).getAttribute('value');
    expect(firstSupplierVal).toBeTruthy();
    await supplierSelect.selectOption(firstSupplierVal);

    await page.locator('input[name="supplierReference"]').fill(invNum);
    await page.locator('input[name="controlNumber"]').fill(ctrlNum);
    await page.locator('select[name="paymentCondition"]').selectOption('CREDIT');
    await page.locator('input[name="creditDays"]').fill('30');
    await page.locator('select[name="currency"]').selectOption('USD');
    await page.locator('input[name="taxPercentage"]').fill('16');
    await page.locator('input[name="officialRate"]').fill('50.00');
    await page.locator('input[name="appliedRate"]').fill('52.50');

    const productSelect = page.locator('select[name="productId"]').first();
    const firstProductVal = await productSelect.locator('option').nth(1).getAttribute('value');
    expect(firstProductVal).toBeTruthy();
    await productSelect.selectOption(firstProductVal);
    await page.locator('input[name="quantity"]').first().fill('4');
    await page.locator('input[name="unitCost"]').first().fill('25.00');

    await expect(page.getByText('116.00 USD')).toBeVisible();
    await expect(page.getByText('6090.00 VES')).toBeVisible();

    await page.getByRole('button', { name: /registrar factura de compra/i }).click();
    await page.waitForURL(/\/purchases\?creado=/);

    await page.goto('/fiscal/purchases-book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro especial de compras/i);
    await expect(page.getByText(invNum)).toBeVisible();
    await expect(page.getByText(ctrlNum)).toBeVisible();

    await page.goto('/accounting/aging?direction=ap');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);
    await expect(page.getByText('116.00 USD').first()).toBeVisible();

    await page.goto('/accounting/journal-entries');
    await expect(page.getByText(invNum).first()).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });
});
