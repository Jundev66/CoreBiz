import { test, expect } from '@playwright/test';
import { signIn } from '../session';

test.describe('Ciclo completo de usuario desde formularios (E2E)', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('usuario crea producto con costo, compra con costo estándar automático, vende y revisa IA', async ({
    page,
  }) => {
    const timestamp = Date.now().toString().slice(-6);
    const sku = `ART-${timestamp}`;
    const productName = `Harina Especial ${timestamp}`;
    const productPrice = '3.50';
    const productCost = '1.80';

    // ── 1. Crear producto con precio y costo estándar ──────────────────────────
    await page.goto('/products/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.locator('input[name="sku"]').fill(sku);
    await page.locator('input[name="name"]').fill(productName);
    await page.locator('input[name="price"]').fill(productPrice);
    await page.locator('input[name="cost"]').fill(productCost);
    await page.locator('input[name="unit"]').fill('kg');
    await page.locator('input[name="initialStock"]').fill('0');

    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/products(\?|$)/);

    // Verificar que el producto aparezca en el catálogo con existencia 0
    const productCell = page.getByRole('cell', { name: productName });
    await expect(productCell).toBeVisible();

    // ── 2. Crear proveedor ─────────────────────────────────────────────────────
    await page.goto('/purchases/suppliers');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const supplierName = `Distribuidora Norte ${timestamp}`;
    const supplierForm = page.getByRole('complementary', {
      name: /nuevo proveedor|new supplier/i,
    });
    await supplierForm.getByLabel(/nombre|name/i).fill(supplierName);
    await supplierForm.getByRole('button', { name: /guardar|save/i }).click();

    await expect(page.getByRole('cell', { name: supplierName }).first()).toBeVisible();

    // ── 3. Registrar compra (Goods Receipt) con costo estándar automático ──────
    await page.goto('/purchases/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Seleccionar proveedor
    const supplierSelect = page.locator('#supplierId');
    const supplierOption = supplierSelect.locator('option').filter({ hasText: supplierName });
    const supplierVal = await supplierOption.getAttribute('value');
    if (!supplierVal) throw new Error(`Proveedor ${supplierName} no encontrado en select`);
    await supplierSelect.selectOption(supplierVal);

    // Seleccionar producto
    const productSelect = page.locator('select[name="productId"]').first();
    const productOption = productSelect.locator('option').filter({ hasText: sku });
    const productVal = await productOption.getAttribute('value');
    if (!productVal) throw new Error(`Producto ${sku} no encontrado en select`);
    await productSelect.selectOption(productVal);

    // Comprobar que unitCost se auto-completó con el costo estándar del producto
    const costInput = page.locator('input[name="unitCost"]').first();
    await expect(costInput).toHaveValue(productCost);

    // Ingresar cantidad recibida: 50 unidades
    await page.locator('input[name="quantity"]').first().fill('50');

    // Registrar la entrada
    await page.getByRole('button', { name: /registrar|record/i }).click();
    await page.waitForURL(/\/purchases(\?|$)/);

    // Confirmar que se generó la recepción RM-XXXXXX
    const receiptStatus = page.getByRole('status').filter({ hasText: /RM-\d+/ });
    await expect(receiptStatus).toBeVisible();

    // Verificar en el catálogo que el inventario subió a 50
    await page.goto('/products');
    const rowAfterPurchase = page.getByRole('row').filter({ hasText: productName });
    await expect(rowAfterPurchase).toContainText('50');

    // ── 4. Crear cliente ───────────────────────────────────────────────────────
    await page.goto('/customers/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const customerName = `Abasto Los Compadres ${timestamp}`;
    await page.locator('input[name="name"]').fill(customerName);
    await page.getByRole('button', { name: /guardar|save/i }).click();
    await page.waitForURL(/\/customers(\?|$)/);

    await expect(page.getByRole('cell', { name: customerName }).first()).toBeVisible();

    // ── 5. Emitir Venta (Nota de Entrega) ───────────────────────────────────────
    // Navegación visible: comprobar que el menú diga "Ventas"
    const salesNavLink = page.getByRole('link', { name: /ventas/i }).first();
    await expect(salesNavLink).toBeVisible();

    await page.goto('/delivery-notes/new');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Seleccionar cliente
    const customerSelect = page.locator('#customerId');
    const customerOption = customerSelect.locator('option').filter({ hasText: customerName });
    const customerVal = await customerOption.getAttribute('value');
    if (!customerVal) throw new Error(`Cliente ${customerName} no encontrado en select`);
    await customerSelect.selectOption(customerVal);

    // Seleccionar producto
    const saleProductSelect = page.locator('select[name="line-product"]').first();
    const saleProductOption = saleProductSelect.locator('option').filter({ hasText: sku });
    const saleProductVal = await saleProductOption.getAttribute('value');
    if (!saleProductVal) throw new Error(`Producto ${sku} no encontrado en venta`);
    await saleProductSelect.selectOption(saleProductVal);

    // Despachar 15 unidades
    await page.locator('input[name="line-quantity"]').first().fill('15');

    // Emitir la nota de entrega
    await page.getByRole('button', { name: /emitir|issue/i }).click();
    await page.waitForURL(/\/delivery-notes(\?|$)/);

    // Confirmar que se generó la nota NE-XXXXXX
    const noteStatus = page.getByRole('status').filter({ hasText: /NE-\d+/ });
    await expect(noteStatus).toBeVisible();

    // Verificar en el catálogo que el inventario bajó exactamente a 35 (50 - 15)
    await page.goto('/products');
    const rowAfterSale = page.getByRole('row').filter({ hasText: productName });
    await expect(rowAfterSale).toContainText('35');

    // ── 6. Verificar pantalla de Ajustes de Inteligencia Artificial ────────────
    await page.goto('/settings/ai');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Verificar que los proveedores estén disponibles y no haya alerta de cifrado no disponible
    await expect(page.getByRole('radiogroup')).toBeVisible();
    await expect(page.getByText(/el servidor no tiene configurado el cifrado/i)).toHaveCount(0);
  });
});
