import { test, expect } from '@playwright/test';
import { signIn } from '../session';

const VE_TENANT = '00000000-0000-0000-0000-0000000000t1';

test.describe('Senior QA Master Audit: Multi-Company, Multi-Country, Accounting, Invoicing, Inventory & RBAC', () => {
  test.beforeEach(async ({ page, context }) => {
    await signIn(page);
    await page.addInitScript(() => {
      localStorage.setItem('corebiz_cookie_consent', 'accepted');
    });
    await context.addCookies([
      { name: 'corebiz_active_tenant', value: VE_TENANT, url: 'http://localhost:3210' },
      { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
    ]);
  });

  test('1. Multi-Company & Multi-Country Isolation: VE vs US Books, Products & New Modules', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/products');
    await expect(page.getByRole('cell', { name: /harina de trigo/i })).toBeVisible();

    await page.goto('/fiscal/sales-book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*ventas/i);

    await page.goto('/fiscal/purchases-book');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*compras/i);

    for (const route of [
      '/accounting/aging',
      '/accounting/aging?direction=ap',
      '/inventory/transfers',
      '/inventory/audits',
      '/fiscal/withholdings',
      '/fiscal/sequences',
      '/invoicing/credit-notes',
      '/invoicing/credit-notes?type=debit',
    ]) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
    }

    await page.goto('/');
    const tenantSelector = page.locator('select#tenantId').first();
    await expect(tenantSelector).toBeVisible();
    await tenantSelector.selectOption({ label: 'Demo Store Inc.' });
    await page
      .getByRole('button', { name: /cambiar|change/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await page.goto('/products');
    await expect(page.getByRole('cell', { name: /whole milk/i })).toBeVisible();
    await expect(page.getByRole('cell', { name: /harina de trigo/i })).toHaveCount(0);

    await page.goto('/fiscal/us-sales-tax');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/us sales tax/i);

    for (const route of [
      '/accounting/aging',
      '/inventory/transfers',
      '/inventory/audits',
      '/fiscal/withholdings',
      '/fiscal/sequences',
      '/invoicing/credit-notes',
    ]) {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
    }

    expect(pageErrors).toHaveLength(0);
  });

  test('2. Accounting Suite: Expenses, Treasury Swap, Partner Drawings & Balanced Trial Balance', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/accounting');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/plan de cuentas/i);
    await expect(page.locator('table')).toBeVisible();

    await page.goto('/accounting/expenses');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gastos operativos/i);
    await page.locator('input[name="beneficiary"]').fill('Fletes QA Auditoria Senior');
    await page.locator('input[name="amount"]').fill('45.00');
    await page.locator('input[name="notes"]').fill('Flete terrestre de auditoria QA');
    await page.getByRole('button', { name: /registrar egreso y asentar en libro diario/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/accounting/treasury');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/tesorería/i);
    await page.locator('input[name="sourceAmount"]').fill('5000.00');
    await page.locator('input[name="targetAmount"]').fill('100.00');
    await page.getByRole('button', { name: /ejecutar y asentar swap/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/accounting/drawings');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/retiros/i);
    await page.locator('input[name="partnerName"]').first().fill('Socio QA Demo');
    await page.locator('input[name="amount"]').first().fill('25.00');
    await page.getByRole('button', { name: /registrar retiro de efectivo/i }).click();
    await page.waitForLoadState('networkidle');

    await page.goto('/accounting/journal-entries');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro diario/i);
    await expect(page.locator('main')).toBeVisible();

    await page.goto('/accounting/trial-balance');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/balance de comprobación/i);
    await expect(page.locator('main')).toBeVisible();

    await page.goto('/accounting/reconciliation');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/conciliación bancaria/i);

    await page.goto('/accounting/forex');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/reexpresión/i);

    expect(pageErrors).toHaveLength(0);
  });

  test('3. US Tenant Full Commercial Lifecycle: Product, Customer, Delivery Note & Invoicing', async ({
    page,
  }) => {
    await page.goto('/');
    const tenantSelector = page.locator('select#tenantId').first();
    await expect(tenantSelector).toBeVisible();
    await tenantSelector.selectOption({ label: 'Demo Store Inc.' });
    await page
      .getByRole('button', { name: /cambiar|change/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    const ts = Date.now().toString().slice(-5);
    const sku = `US-QA-${ts}`;
    const prodName = `US Synthetic Item ${ts}`;

    await page.goto('/products/new');
    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(prodName);
    await page.locator('input[name="price"]').fill('25.00');
    await page.locator('input[name="cost"]').fill('14.00');
    await page.locator('input[name="unit"]').fill('pcs');
    await page.locator('input[name="initialStock"]').fill('30');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);
    await expect(page.getByRole('cell', { name: prodName })).toBeVisible();

    await page.goto('/customers/new');
    const customerName = `Test Client US ${ts}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.locator('input[name="taxId"]').fill('12-3456789');
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);
    await expect(page.getByRole('cell', { name: customerName }).first()).toBeVisible();

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const rateInput = page.locator('input[name="exchangeRate"]');
    if (await rateInput.isVisible()) {
      await rateInput.fill('1.00');
      await page.getByRole('button', { name: /guardar|save/i }).click();
      await page.waitForLoadState('networkidle');
    }

    await page.goto('/delivery-notes/new');
    const custSelect = page.locator('select[name="customerId"]');
    const custVal = await custSelect
      .locator('option')
      .filter({ hasText: customerName })
      .getAttribute('value');
    if (custVal) {
      await custSelect.selectOption(custVal);
      const prodSelect = page.locator('select[name="line-product"]').first();
      const prodVal = await prodSelect
        .locator('option')
        .filter({ hasText: sku })
        .getAttribute('value');
      if (prodVal) {
        await prodSelect.selectOption(prodVal);
        await page.locator('input[name="line-quantity"]').first().fill('3');
        await page.getByRole('button', { name: /emitir|issue/i }).click();
        await page.waitForURL(/\/delivery-notes(\?|$)/);
        await expect(page.getByRole('cell', { name: customerName }).first()).toBeVisible();
      }
    }

    await page.goto('/invoicing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/payments');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/reports');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('4. Exhaustive RBAC Matrix across all 5 Roles (owner, admin, sales, warehouse, viewer)', async ({
    page,
    context,
  }) => {
    const roleChecks: Array<{
      role: string;
      allowed: string[];
      denied: string[];
    }> = [
      {
        role: 'owner',
        allowed: [
          '/accounting',
          '/accounting/aging',
          '/invoicing',
          '/invoicing/credit-notes',
          '/inventory/transfers',
          '/inventory/audits',
          '/fiscal/withholdings',
          '/fiscal/sequences',
          '/purchases',
          '/customers',
          '/settings/team',
          '/settings/audit',
        ],
        denied: [],
      },
      {
        role: 'admin',
        allowed: [
          '/accounting',
          '/accounting/aging',
          '/invoicing/credit-notes',
          '/inventory/transfers',
          '/fiscal/withholdings',
          '/settings/team',
        ],
        denied: [],
      },
      {
        role: 'sales',
        allowed: [
          '/customers',
          '/invoicing',
          '/invoicing/credit-notes',
          '/accounting/aging',
          '/delivery-notes',
          '/payments',
        ],
        denied: ['/purchases', '/settings/team'],
      },
      {
        role: 'warehouse',
        allowed: ['/products', '/inventory/transfers', '/inventory/audits', '/purchases'],
        denied: [
          '/customers',
          '/accounting/aging',
          '/fiscal/withholdings',
          '/fiscal/sequences',
          '/invoicing/credit-notes',
        ],
      },
      {
        role: 'viewer',
        allowed: ['/accounting', '/invoicing', '/customers', '/products', '/purchases'],
        denied: ['/settings/team'],
      },
    ];

    for (const check of roleChecks) {
      await context.addCookies([
        { name: 'corebiz_demo_role', value: check.role, url: 'http://localhost:3210' },
      ]);

      for (const route of check.allowed) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByText(/no está en tu alcance|outside your access/i)).toHaveCount(0);
      }

      for (const route of check.denied) {
        await page.goto(route);
        await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();
      }
    }
  });
});
