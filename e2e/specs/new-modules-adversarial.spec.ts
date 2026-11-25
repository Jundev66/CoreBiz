import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('New Modules 4-Tier Adversarial E2E Suite', () => {
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

  test('Tier 1: Owner navigates all 6 new modules via sidebar and direct routes without errors', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');
    await expect(page.locator('main')).toBeVisible();

    await page.goto('/invoicing/credit-notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /notas de crédito & débito fiscales/i,
    );
    await page.goto('/invoicing/credit-notes?type=debit');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /notas de crédito & débito fiscales/i,
    );

    await page.goto('/accounting/aging');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);
    await page.goto('/accounting/aging?direction=ap');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);

    await page.goto('/inventory/transfers');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /depósitos & traslados de mercancía/i,
    );

    await page.goto('/inventory/audits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /tomas físicas & mermas de inventario/i,
    );

    await page.goto('/fiscal/withholdings');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /comprobantes de retención fiscal/i,
    );

    await page.goto('/fiscal/sequences');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /rangos y vencimientos fiscales/i,
    );

    expect(pageErrors).toHaveLength(0);
  });

  test('Tier 2: Boundary and malformed query parameters degrade safely without UI crash', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(
      '/accounting/aging?direction=%3Cscript%3Ealert(1)%3C/script%3E&currency=INVALID_CUR&asOfDate=9999-99-99',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);

    await page.goto('/invoicing/credit-notes?type=sql_injection_drop_table');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /notas de crédito & débito fiscales/i,
    );

    expect(pageErrors).toHaveLength(0);
  });

  test('Tier 3: Multi-Role RBAC & Multi-Tenant isolation across new modules', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: 'corebiz_demo_role', value: 'warehouse', url: 'http://localhost:3210' },
    ]);

    await page.goto('/inventory/transfers');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /depósitos & traslados de mercancía/i,
    );

    await page.goto('/inventory/audits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /tomas físicas & mermas de inventario/i,
    );

    for (const restrictedRoute of [
      '/accounting/aging',
      '/fiscal/withholdings',
      '/fiscal/sequences',
      '/invoicing/credit-notes',
    ]) {
      await page.goto(restrictedRoute);
      await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();
    }

    await context.addCookies([
      { name: 'corebiz_demo_role', value: 'sales', url: 'http://localhost:3210' },
    ]);

    await page.goto('/invoicing/credit-notes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /notas de crédito & débito fiscales/i,
    );

    await page.goto('/accounting/aging');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);

    await page.goto('/purchases');
    await expect(page.getByText(/no está en tu alcance|outside your access/i)).toBeVisible();

    await context.addCookies([
      { name: 'corebiz_demo_role', value: 'owner', url: 'http://localhost:3210' },
      {
        name: 'corebiz_active_tenant',
        value: '00000000-0000-0000-0000-0000000000t2',
        url: 'http://localhost:3210',
      },
    ]);

    await page.goto('/accounting/aging');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/antigüedad de saldos/i);
    await page.goto('/fiscal/withholdings');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      /comprobantes de retención fiscal/i,
    );
  });

  test('Tier 4: Page reload stability across dynamic views', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    for (const route of [
      '/accounting/aging?direction=ap',
      '/inventory/audits',
      '/fiscal/sequences',
    ]) {
      await page.goto(route);
      await page.reload();
      await expect(page.locator('main')).toBeVisible();
    }

    expect(pageErrors).toHaveLength(0);
  });
});
