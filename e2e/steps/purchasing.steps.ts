import { expect, type Page } from '@playwright/test';
import { Given, When, Then } from './fixtures';

/**
 * Pasos del modulo de compras.
 *
 * El saldo se lee de la PANTALLA de inventario, igual que en los pasos de venta,
 * y por la misma razon: lo que hay que comprobar es que el numero que ve una
 * persona cambia, no que una variable interna cambio.
 */

const uniqueCode = () => `PRV-${Date.now().toString().slice(-6)}`;

async function readStock(page: Page, sku: string): Promise<number> {
  await page.goto('/products');
  const row = page.getByRole('row').filter({ hasText: sku });
  const cells = await row.locator('td').allTextContents();
  const stockCell = cells[cells.length - 1] ?? '';
  return Number(stockCell.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

/** Selecciona la opcion cuyo texto CONTIENE lo indicado. */
async function selectByPartialLabel(select: ReturnType<Page['locator']>, needle: string) {
  const options = await select.locator('option').allTextContents();
  const match = options.find((text) => text.includes(needle));
  if (match === undefined) throw new Error(`No hay opcion que contenga "${needle}"`);
  await select.selectOption({ label: match });
}

When('I open the purchases page', async ({ page }) => {
  await page.goto('/purchases');
});

When('I open the suppliers page', async ({ page }) => {
  await page.goto('/purchases/suppliers');
  // Nivel 1 a proposito: el titulo de la pantalla, no el encabezado oculto que
  // etiqueta la tabla para lectores de pantalla.
  await expect(page.getByRole('heading', { name: 'Suppliers', level: 1 })).toBeVisible();
});

Then('I should see that purchases require the paid plan', async ({ page }) => {
  // El modulo se VE bloqueado, no desaparece. Ocultarlo haria imposible que
  // alguien decidiera si le interesa.
  await expect(page.getByText(/is on the PRO plan/i)).toBeVisible();
});

Then('I should not see any supplier', async ({ page }) => {
  await expect(page.getByRole('table')).toHaveCount(0);
});

When('I register a new supplier', async ({ page, world }) => {
  world.lastCode = uniqueCode();

  const form = page.getByRole('complementary', { name: /new supplier/i });
  await form.getByLabel(/code/i).fill(world.lastCode);
  await form.getByLabel(/name/i).fill('Distribuidora de Prueba');
  await form.getByRole('button', { name: /save/i }).click();
});

Then('the supplier appears in the list', async ({ page, world }) => {
  await expect(page.getByRole('cell', { name: world.lastCode ?? '' })).toBeVisible();
});

/**
 * Asegura que exista un proveedor sin depender de otro escenario.
 *
 * Los escenarios comparten servidor, asi que "ya cree uno antes" solo es cierto
 * segun el orden de ejecucion. Este paso lo crea si hace falta y no hace nada si
 * ya lo hay.
 */
Given('there is at least one supplier', async ({ page }) => {
  await page.goto('/purchases/suppliers');

  if ((await page.getByRole('table').count()) > 0) return;

  const form = page.getByRole('complementary', { name: /new supplier/i });
  await form.getByLabel(/code/i).fill(uniqueCode());
  await form.getByLabel(/name/i).fill('Distribuidora de Prueba');
  await form.getByRole('button', { name: /save/i }).click();

  await expect(page.getByRole('table')).toBeVisible();
});

When(
  'I record a delivery of {int} units of {string}',
  async ({ page, world }, quantity: number, sku: string) => {
    world.stockBefore ??= await readStock(page, sku);

    await page.goto('/purchases/new');
    await selectByPartialLabel(page.locator('#supplierId'), 'PRV-');
    await selectByPartialLabel(page.locator('select[name="productId"]').first(), sku);
    await page.locator('input[name="quantity"]').first().fill(String(quantity));
    await page.locator('input[name="unitCost"]').first().fill('1.00');
    await page.getByRole('button', { name: /record the delivery/i }).click();
  },
);

When('I record a delivery with no lines', async ({ page }) => {
  await page.goto('/purchases/new');
  await selectByPartialLabel(page.locator('#supplierId'), 'PRV-');
  await page.getByRole('button', { name: /record the delivery/i }).click();
});

Then('the delivery is recorded successfully', async ({ page }) => {
  await expect(page.getByRole('status')).toContainText(/recorded/i);
});

Then(
  'the stock of {string} went up by {int}',
  async ({ page, world }, sku: string, delta: number) => {
    const before = world.stockBefore ?? 0;

    // Se comprueba la VARIACION y no un saldo fijo: los escenarios comparten
    // servidor, y fijar un numero haria que este test dependiera del orden.
    await expect
      .poll(() => readStock(page, sku), { message: `stock de ${sku}` })
      .toBe(before + delta);
  },
);

Then('I should see an error saying the delivery needs at least one product', async ({ page }) => {
  // Acotado al formulario porque Next monta su propio `role="alert"` para
  // anunciar los cambios de ruta a los lectores de pantalla. Buscarlo en toda
  // la pagina encuentra los dos y el selector falla por ambiguedad.
  const alert = page.locator('form').getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(/at least one product/i);
});
