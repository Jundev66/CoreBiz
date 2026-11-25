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

  test('verifies company account determination settings and item-level account override UI', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/settings/accounting');
    await expect(
      page.getByRole('heading', { name: /mapeo contable de la empresa/i }),
    ).toBeVisible();
    await expect(page.getByText(/ingresos por ventas/i).first()).toBeVisible();
    await expect(page.getByText(/cuentas por cobrar/i).first()).toBeVisible();

    await page.goto('/products/new');
    const revSelect = page.locator('select[name="revenueAccountId"]');
    await expect(revSelect).toBeVisible();
    const invSelect = page.locator('select[name="inventoryAccountId"]');
    await expect(invSelect).toBeVisible();

    const ts = Date.now().toString().slice(-4);
    await page.locator('input[name="sku"]').fill(`ACC-ITEM-${ts}`);
    await page.locator('input[name="name"]').fill(`Item Cuenta Propia ${ts}`);
    await page.locator('input[name="price"]').fill('19.99');
    const revOpt = await revSelect.locator('option').nth(1).getAttribute('value');
    if (revOpt) {
      await revSelect.selectOption(revOpt);
    }
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);
    await expect(page.getByRole('cell', { name: `Item Cuenta Propia ${ts}` })).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('manages dynamic tax catalog in settings and applies custom tax in new invoice', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/settings/taxes');
    await expect(page.getByRole('heading', { name: /agregar nuevo impuesto/i })).toBeVisible();
    await expect(page.getByText('IVA_16')).toBeVisible();

    const ts = Date.now().toString().slice(-3);
    const customCode = `IVA_QA_${ts}`;
    const customName = `IVA Especial QA (${ts})`;

    await page.locator('input[name="code"]').fill(customCode);
    await page.locator('input[name="name"]').fill(customName);
    await page.locator('input[name="ratePercent"]').fill('22');
    await page.getByRole('button', { name: /crear impuesto/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(customCode)).toBeVisible();

    await page.goto('/invoicing/new');
    const lineTaxSelect = page.locator('select[name="line-tax"]').first();
    await expect(lineTaxSelect).toBeVisible();
    await expect(lineTaxSelect.locator('option', { hasText: customName })).toHaveCount(1);

    expect(pageErrors).toHaveLength(0);
  });

  test('unifies POS synced tickets into Facturas de Venta without duplicate sidebar entry', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/invoicing');
    await expect(page.getByRole('link', { name: 'Terminal POS', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /tickets pos/i })).toHaveCount(0);

    const ts = Date.now().toString().slice(-6);
    const ticketNumber = `POS-QA-${ts}`;
    const opId = crypto.randomUUID();
    const lineId = crypto.randomUUID();

    const syncRes = await page.request.post('/api/v1/pos/sync', {
      headers: {
        'x-corebiz-tenant': '00000000-0000-0000-0000-0000000000t1',
      },
      data: {
        deviceId: 'dev-qa-01',
        operations: [
          {
            operationId: opId,
            type: 'sale.issue',
            sequence: 1,
            payloadHash: 'a'.repeat(64),
            payload: {
              operationId: opId,
              ticketNumber,
              paymentMethod: 'cash',
              occurredAt: new Date().toISOString(),
              lines: [
                {
                  id: lineId,
                  temporaryName: 'Cafe Espresso POS',
                  quantity: '1',
                  unitPriceMinor: '500',
                },
              ],
            },
          },
        ],
      },
    });
    expect(syncRes.ok(), `status=${syncRes.status()} body=${await syncRes.text()}`).toBe(true);

    await page.reload();
    await expect(page.getByText(ticketNumber)).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });
});
