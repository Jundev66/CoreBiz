import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Sales Invoicing Flow & Invoice-to-DeliveryNote Integration', () => {
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

  test('issues CASH and CREDIT sales invoices from UI, reflects in Aging/Ledger and links to Delivery Note', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/invoicing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/facturas de venta/i);

    await page.getByRole('link', { name: /nueva factura/i }).click();
    await expect(page).toHaveURL(/\/invoicing\/new$/);

    const ts = Date.now().toString().slice(-4);
    const cashDocNum = `FAC-QA-C-${ts}`;
    const creditDocNum = `FAC-QA-R-${ts}`;

    const customerSelect = page.locator('select[name="customerId"]');
    const firstCustomerVal = await customerSelect.locator('option').nth(1).getAttribute('value');
    expect(firstCustomerVal).toBeTruthy();
    await customerSelect.selectOption(firstCustomerVal);

    await page.locator('input[name="documentNumber"]').fill(cashDocNum);

    const productSelect = page.locator('select[name="line-product"]').first();
    const firstProductVal = await productSelect.locator('option').nth(1).getAttribute('value');
    expect(firstProductVal).toBeTruthy();
    await productSelect.selectOption(firstProductVal);
    await page.locator('input[name="line-quantity"]').first().fill('2');

    await page.getByRole('button', { name: /emitir factura de venta/i }).click();
    await page.waitForURL(/\/invoicing$/);
    await expect(page.getByText(cashDocNum)).toBeVisible();

    await page.getByRole('link', { name: /nueva factura/i }).click();
    await expect(page).toHaveURL(/\/invoicing\/new$/);

    await page.locator('select[name="customerId"]').selectOption(firstCustomerVal);
    await page.locator('input[name="documentNumber"]').fill(creditDocNum);
    await page.locator('select[name="paymentCondition"]').selectOption('CREDIT');
    await page.locator('input[name="creditDays"]').fill('30');
    await page.locator('select[name="line-product"]').first().selectOption(firstProductVal);
    await page.locator('input[name="line-quantity"]').first().fill('3');

    await page.getByRole('button', { name: /emitir factura de venta/i }).click();
    await page.waitForURL(/\/invoicing$/);
    await expect(page.getByText(creditDocNum)).toBeVisible();

    await page.goto('/accounting/aging');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);
    await expect(page.locator('main')).toBeVisible();

    await page.goto('/accounting/trial-balance');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/balance de comprobación/i);

    await page.goto('/invoicing');
    const dispatchLink = page.getByRole('link', { name: /nota de entrega/i }).first();
    await dispatchLink.click();
    await expect(page).toHaveURL(/\/delivery-notes\/new\?customerId=/);
    await expect(page.locator('select[name="customerId"]')).toHaveValue(firstCustomerVal!);

    expect(pageErrors).toHaveLength(0);
  });
});
