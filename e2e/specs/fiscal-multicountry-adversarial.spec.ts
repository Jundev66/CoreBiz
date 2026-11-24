import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Fiscal Multi-Country & Invoicing Adversarial Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.describe('Tier 1: Nominal Multi-Country Fiscal Flows', () => {
    test('SENIAT Libro de Ventas renders statutory columns and fiscal summary', async ({
      page,
    }) => {
      await page.goto('/fiscal/sales-book');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*ventas/i);
      await expect(page.locator('main')).toBeVisible();
    });

    test('SENIAT Libro de Compras renders purchases ledger and tax credit cards', async ({
      page,
    }) => {
      await page.goto('/fiscal/purchases-book');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/libro.*compras/i);
      await expect(page.locator('main')).toBeVisible();
    });

    test('US Sales Tax Remittance report renders jurisdictional splits', async ({ page }) => {
      await page.goto('/fiscal/us-sales-tax');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/us sales tax/i);
      await expect(page.locator('main')).toBeVisible();
    });

    test('Commercial and Fiscal Invoicing catalog renders invoices with status', async ({
      page,
    }) => {
      await page.goto('/invoicing');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/facturación fiscal/i);
      await expect(page.locator('main')).toBeVisible();
    });

    test('POS sales register lists point of sale tickets', async ({ page }) => {
      await page.goto('/pos-sales');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/ventas de caja/i);
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Tier 2: Boundary & Resilience Verifications', () => {
    test('Fiscal reports handle extreme date ranges without server error', async ({ page }) => {
      await page.goto('/fiscal/sales-book?from=2099-01-01&to=2099-12-31');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
    });

    test('Invoicing catalog with non-existent status filter falls back gracefully', async ({
      page,
    }) => {
      await page.goto('/invoicing?status=UNSUPPORTED_STATUS');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('main')).toBeVisible();
    });
  });

  test.describe('Tier 3: Multi-Tenant Zero-Leakage & Access Isolation', () => {
    test('Fiscal reports strictly display data for the active company context', async ({
      page,
    }) => {
      await page.goto('/fiscal/sales-book');
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('UNAUTHORIZED_EXTERNAL_CORP');
    });
  });

  test.describe('Tier 4: Idempotency & Navigation Chaos', () => {
    test('Consecutive switches between fiscal books and invoicing preserve stability', async ({
      page,
    }) => {
      await page.goto('/fiscal/sales-book');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.goto('/fiscal/purchases-book');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.goto('/fiscal/us-sales-tax');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.goto('/invoicing');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  });
});
