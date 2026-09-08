import { expect, type Locator } from '@playwright/test';
import { Given, When, Then, setDemoCookies, readStock } from './fixtures';

/**
 * Pasos de ventas, inventario y planes.
 *
 * El estado se comprueba a traves de la interfaz, no del almacen interno: si la
 * pantalla de inventario dice 220 unidades, es que el usuario ve 220 unidades. Un test
 * que consultase el estado por dentro pasaria aunque la pantalla mostrase otra cosa.
 */

Given('the business is on the free plan', async ({ page }) => {
  await setDemoCookies(page, { plan: 'free' });
});

/**
 * Lee el stock actual y lo guarda en el mundo del escenario.
 *
 * Los escenarios comparten el estado del servidor, asi que fijar cantidades absolutas
 * los haria dependientes del orden de ejecucion. Comprobar la VARIACION es robusto y
 * ademas describe mejor la regla: despachar 20 unidades quita exactamente 20, sea cual
 * sea el saldo de partida.
 */
Given('I note the current stock of {string}', async ({ page, world }, sku: string) => {
  world.stockBefore = await readStock(page, sku);
});

Then(
  'the stock of {string} went down by {int}',
  async ({ page, world }, sku: string, delta: number) => {
    const before = world.stockBefore ?? 0;
    await expect
      .poll(() => readStock(page, sku), { message: `stock de ${sku}` })
      .toBe(before - delta);
  },
);

Then('the stock of {string} did not change', async ({ page, world }, sku: string) => {
  expect(await readStock(page, sku)).toBe(world.stockBefore ?? 0);
});

When('I start a new delivery note for {string}', async ({ page }, customer: string) => {
  await page.goto('/delivery-notes/new');
  await selectByPartialLabel(page.locator('#customerId'), customer);
});

/**
 * Selecciona la opcion cuyo texto CONTIENE lo indicado.
 *
 * `selectOption({ label })` exige coincidencia exacta, y las opciones llevan datos
 * anexos ("CLI-001 - Bodega La Esquina", "HRN-001 - Harina 1 kg - $ 1.20"). Buscar por
 * fragmento mantiene los escenarios legibles: quien los lee piensa en el nombre del
 * cliente, no en como se compone la etiqueta del desplegable.
 */
async function selectByPartialLabel(select: Locator, needle: string): Promise<void> {
  const value = await select
    .locator('option')
    .filter({ hasText: needle })
    .first()
    .getAttribute('value');

  expect(value, `no hay ninguna opcion que contenga "${needle}"`).toBeTruthy();
  await select.selectOption(value as string);
}

When('I add {int} units of {string}', async ({ page }, units: number, sku: string) => {
  // La ultima fila es siempre la que esta libre.
  const productSelects = page.locator('select[name="line-product"]');
  const quantityInputs = page.locator('input[name="line-quantity"]');
  const index = (await productSelects.count()) - 1;

  await selectByPartialLabel(productSelects.nth(index), sku);
  await quantityInputs.nth(index).fill(String(units));
});

When('I issue the delivery note', async ({ page }) => {
  await page.getByRole('button', { name: 'Issue' }).click();
});

When('I open the delivery notes page', async ({ page }) => {
  await page.goto('/delivery-notes');
  await expect(page.getByRole('heading', { name: 'Delivery notes' })).toBeVisible();
});

When('I open the delivery note {string}', async ({ page }, number: string) => {
  await page.goto('/delivery-notes');
  await page.getByRole('link', { name: number }).click();
});

When('I open the products page', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
});

When('I open the reports page', async ({ page }) => {
  await page.goto('/reports');
});

Then('the note is issued successfully', async ({ page }) => {
  await expect(page.locator('form').getByRole('status')).toContainText('issued successfully');
});

Then('I should see an error saying the document needs at least one line', async ({ page }) => {
  await expect(page.locator('form').getByRole('alert')).toContainText('at least one line');
});

Then('I should see an error about insufficient stock', async ({ page }) => {
  await expect(page.locator('form').getByRole('alert')).toContainText('Not enough stock');
});

Then('I should see the delivery note {string}', async ({ page }, number: string) => {
  await expect(page.getByRole('link', { name: number })).toBeVisible();
});

Then('the note shows the exchange rate that was applied', async ({ page }) => {
  // La tasa se muestra junto a su fecha de captura: sin la fecha, el dato invita a
  // pensar que es la tasa de hoy, que es justo lo que no es.
  await expect(page.getByText(/Bs\/USD/)).toBeVisible();
});

Then('the note carries the non-fiscal notice', async ({ page }) => {
  await expect(page.getByText(/no fiscal value/i).first()).toBeVisible();
});

Then('I should see that reports require the paid plan', async ({ page }) => {
  await expect(page.getByText('available on the PRO plan')).toBeVisible();
});

Then('I should not see any sales figures', async ({ page }) => {
  await expect(page.getByText('Period sales')).toHaveCount(0);
});

Then('I should see the sales figures', async ({ page }) => {
  await expect(page.getByText('Period sales')).toBeVisible();
  await expect(page.getByText('Inventory value')).toBeVisible();
});

Then('I should see the best selling products', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Best selling products' })).toBeVisible();
});

Then('the reports link is marked as a paid feature', async ({ page }) => {
  // El modulo bloqueado se muestra con candado en lugar de ocultarse: saber que existe
  // algo mas es parte de como funciona un freemium honesto.
  const link = page.getByRole('link', { name: /Reports/ });
  await expect(link).toBeVisible();
  await expect(link.getByLabel('PRO')).toBeVisible();
});
