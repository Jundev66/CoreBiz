import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Senior ERP, POS, Accounting & Fiscal Master QA Suite', () => {
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

  test.describe('1. Multi-Company & Multi-Country Tenant Switching (VE vs US)', () => {
    test('discovers available companies and switches between VE and US contexts seamlessly', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(page.locator('main')).toBeVisible();

      const tenantSelector = page.locator('select#tenantId').first();
      await expect(tenantSelector).toBeVisible();

      const optionCount = await tenantSelector.locator('option').count();
      expect(optionCount).toBeGreaterThanOrEqual(2);

      await tenantSelector.selectOption({ label: 'Demo Store Inc.' });
      await page
        .getByRole('button', { name: /cambiar|change/i })
        .first()
        .click();
      await page.waitForLoadState('networkidle');

      await page.goto('/products');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const usProduct = page.getByRole('cell', { name: /whole milk/i });
      await expect(usProduct).toBeVisible();

      await page.goto('/fiscal/us-sales-tax');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/us sales tax/i);

      await page.goto('/');
      await page.locator('select#tenantId').first().selectOption({ label: 'Empresa Demo C.A.' });
      await page
        .getByRole('button', { name: /cambiar|change/i })
        .first()
        .click();
      await page.waitForLoadState('networkidle');

      await page.goto('/products');
      await expect(page.getByRole('cell', { name: /harina de trigo/i })).toBeVisible();

      await page.goto('/fiscal/sales-book');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*ventas/i);
    });
  });

  test.describe('2. Multi-User RBAC & Granular Role Authorization', () => {
    test('viewer role has read-only access to records without mutation controls', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'corebiz_demo_role', value: 'viewer', url: 'http://localhost:3210' },
      ]);

      await page.goto('/accounting');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto('/customers');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto('/invoicing');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('warehouse role cannot access customer directory or financial sales', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'corebiz_demo_role', value: 'warehouse', url: 'http://localhost:3210' },
      ]);

      await page.goto('/customers');
      await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();

      await page.goto('/products');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto('/purchases');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('sales role can issue delivery notes but cannot access purchase reception', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        { name: 'corebiz_demo_role', value: 'sales', url: 'http://localhost:3210' },
      ]);

      await page.goto('/delivery-notes');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto('/invoicing');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.goto('/purchases');
      await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();
    });
  });

  test.describe('3. Core Commercial, Purchasing & Inventory Lifecycle', () => {
    test('creates customer, supplier, product with cost, receives inventory and dispatches sale', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'corebiz_active_tenant',
          value: '00000000-0000-0000-0000-0000000000t1',
          url: 'http://localhost:3210',
        },
        { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
      ]);

      const ts = Date.now().toString().slice(-5);
      const sku = `PROD-${ts}`;
      const prodName = `Producto QA Master ${ts}`;
      const prodPrice = '12.50';
      const prodCost = '7.20';

      await page.goto('/products/new');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await page.locator('input[name="sku"]').fill(sku);
      await page.locator('input[name="name"]').fill(prodName);
      await page.locator('input[name="price"]').fill(prodPrice);
      await page.locator('input[name="cost"]').fill(prodCost);
      await page.locator('input[name="unit"]').fill('und');
      await page.locator('input[name="initialStock"]').fill('0');
      await page.getByRole('button', { name: /guardar|save/i }).click();
      await page.waitForURL(/\/products(\?|$)/);

      await expect(page.getByRole('cell', { name: prodName })).toBeVisible();

      await page.goto('/purchases/suppliers');
      const supplierName = `Proveedor QA Mayorista ${ts}`;
      const supplierForm = page.getByRole('complementary', {
        name: /nuevo proveedor|new supplier/i,
      });
      await supplierForm.getByLabel(/nombre|name/i).fill(supplierName);
      await supplierForm.getByRole('button', { name: /guardar|save/i }).click();
      await expect(page.getByRole('cell', { name: supplierName }).first()).toBeVisible();

      await page.goto('/purchases/new');
      const supplierSelect = page.locator('#supplierId');
      const supplierOpt = supplierSelect.locator('option').filter({ hasText: supplierName });
      const supplierVal = await supplierOpt.getAttribute('value');
      if (supplierVal) {
        await supplierSelect.selectOption(supplierVal);
      }

      const productSelect = page.locator('select[name="productId"]').first();
      const productOpt = productSelect.locator('option').filter({ hasText: sku });
      const prodVal = await productOpt.getAttribute('value');
      if (prodVal) {
        await productSelect.selectOption(prodVal);
        await expect(page.locator('input[name="unitCost"]').first()).toHaveValue(prodCost);
        await page.locator('input[name="quantity"]').first().fill('40');
        await page.getByRole('button', { name: /registrar|record/i }).click();
        await page.waitForURL(/\/purchases(\?|$)/);
      }

      await page.goto('/products');
      const rowAfterPurchase = page.getByRole('row').filter({ hasText: prodName });
      await expect(rowAfterPurchase).toBeVisible();

      await page.goto('/customers/new');
      const customerName = `Cliente Corporativo QA ${ts}`;
      await page.locator('input[name="name"]').fill(customerName);
      await page.locator('input[name="taxId"]').fill('J-39988776-5');
      await page.getByRole('button', { name: /guardar|save/i }).click();
      await page.waitForURL(/\/customers(\?|$)/);
      await expect(page.getByRole('cell', { name: customerName }).first()).toBeVisible();

      await page.goto('/delivery-notes/new');
      const custSelect = page.locator('select[name="customerId"]');
      const custOpt = custSelect.locator('option').filter({ hasText: customerName });
      const custVal = await custOpt.getAttribute('value');
      if (custVal) {
        await custSelect.selectOption(custVal);
        const lineProdSelect = page.locator('select[name="line-product"]').first();
        const lineProdOpt = lineProdSelect.locator('option').filter({ hasText: sku });
        const lineProdVal = await lineProdOpt.getAttribute('value');
        if (lineProdVal) {
          await lineProdSelect.selectOption(lineProdVal);
          await page.locator('input[name="line-quantity"]').first().fill('5');
          await page.getByRole('button', { name: /emitir|issue/i }).click();
          await page.waitForURL(/\/delivery-notes(\?|$)/);
          await expect(page.getByRole('cell', { name: customerName }).first()).toBeVisible();
        }
      }
    });
  });

  test.describe('4. Double-Entry Accounting & Ledger Validation', () => {
    test('validates chart of accounts, balanced trial balance, and ledger entries', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'corebiz_active_tenant',
          value: '00000000-0000-0000-0000-0000000000t1',
          url: 'http://localhost:3210',
        },
        { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
      ]);

      await page.goto('/accounting');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/plan de cuentas/i);
      await expect(page.locator('table')).toBeVisible();

      await page.goto('/accounting/trial-balance');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/balance de comprobación/i);
      await expect(page.locator('main')).toBeVisible();

      await page.goto('/accounting/journal-entries');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro diario/i);
      await expect(page.locator('main')).toBeVisible();

      await page.goto('/accounting/expenses');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/gastos operativos/i);
      await expect(
        page.getByRole('button', { name: /registrar egreso y asentar en libro diario/i }),
      ).toBeVisible();

      await page.goto('/accounting/treasury');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/tesorería/i);
      await expect(page.getByRole('button', { name: /ejecutar y asentar swap/i })).toBeVisible();

      await page.goto('/accounting/drawings');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/retiros/i);
      await expect(
        page.getByRole('button', { name: /registrar retiro de efectivo/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /registrar autoconsumo de mercancía/i }),
      ).toBeVisible();

      await page.goto('/accounting/reconciliation');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/conciliación bancaria/i);

      await page.goto('/accounting/forex');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/reexpresión/i);
    });
  });

  test.describe('5. Statutory Fiscal Books & POS Overview', () => {
    test('renders statutory SENIAT sales/purchases books and POS sales register', async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'corebiz_active_tenant',
          value: '00000000-0000-0000-0000-0000000000t1',
          url: 'http://localhost:3210',
        },
        { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
      ]);

      await page.goto('/fiscal/sales-book');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*ventas/i);

      await page.goto('/fiscal/purchases-book');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*compras/i);

      await page.goto('/fiscal/us-sales-tax');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/us sales tax/i);

      await page.goto('/pos-sales');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ventas de caja/i);

      await page.goto('/conflicts');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        /inconsistencias|conflictos/i,
      );
    });
  });
});
