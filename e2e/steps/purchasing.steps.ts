import { expect, type Page } from '@playwright/test';
import { Given, When, Then, readStock } from './fixtures';

/**
 * Pasos del modulo de compras.
 *
 * El saldo se lee de la PANTALLA de inventario, igual que en los pasos de venta,
 * y por la misma razon: lo que hay que comprobar es que el numero que ve una
 * persona cambia, no que una variable interna cambio.
 */

const uniqueCode = () => `PRV-${Date.now().toString().slice(-6)}`;

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

Then('I should not see any supplier', async ({ page }) => {
  await expect(page.getByRole('table')).toHaveCount(0);
});

When('I register a new supplier', async ({ page, world }) => {
  // El nombre lleva un sufijo unico y el CODIGO ya no se escribe: lo asigna el
  // sistema. Lo que este paso comprueba pasa a ser que el alta funcione sin que
  // nadie tenga que inventarse nada.
  world.lastCode = `Distribuidora ${uniqueCode()}`;

  const form = page.getByRole('complementary', { name: /new supplier/i });
  await form.getByLabel(/name/i).fill(world.lastCode);
  await form.getByRole('button', { name: /save/i }).click();
});

Then('the supplier appears in the list', async ({ page, world }) => {
  await expect(page.getByRole('cell', { name: world.lastCode ?? '' }).first()).toBeVisible();
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
  await form.getByLabel(/name/i).fill(`Distribuidora ${uniqueCode()}`);
  await form.getByRole('button', { name: /save/i }).click();

  await expect(page.getByRole('table')).toBeVisible();
});

When(
  'I record a delivery of {int} units of {string}',
  async ({ page, world }, quantity: number, sku: string) => {
    world.stockBefore ??= await readStock(page, sku);

    await page.goto('/purchases/new');
    await selectByPartialLabel(page.locator('#supplierId'), 'PRV');
    await selectByPartialLabel(page.locator('select[name="productId"]').first(), sku);
    await page.locator('input[name="quantity"]').first().fill(String(quantity));
    await page.locator('input[name="unitCost"]').first().fill('1.00');
    await page.getByRole('button', { name: /record the delivery/i }).click();

    // Se guarda el numero que devuelve la confirmacion. Sin el, volver a abrir el
    // documento significaria "el primero de la lista", y con los escenarios
    // corriendo en paralelo ese puede ser el de otro.
    //
    // El aviso ya no vive en `main`: registrar devuelve al listado y el aviso llega
    // flotando encima del marco. Se acota por el NUMERO, que es lo que se viene a
    // buscar, en lugar de por la zona de la pagina.
    const confirmation = page.getByRole('status').filter({ hasText: /RM-\d+/ });
    await expect(confirmation).toBeVisible();
    const found = /RM-\d+/.exec((await confirmation.textContent()) ?? '');
    if (found !== null) world.lastNumber = found[0];
  },
);

When('I record a delivery with no lines', async ({ page }) => {
  await page.goto('/purchases/new');
  await selectByPartialLabel(page.locator('#supplierId'), 'PRV');
  await page.getByRole('button', { name: /record the delivery/i }).click();
});

Then('the delivery is recorded successfully', async ({ page }) => {
  // Se filtra por el texto y no por la zona: el marco pinta su propio `role="status"`
  // —el aviso de que la demostracion es temporal— y una busqueda sin acotar encuentra
  // los dos y falla por ambiguedad.
  await expect(page.getByRole('status').filter({ hasText: /recorded/i })).toBeVisible();
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

When('I open the recorded delivery', async ({ page, world }) => {
  const number = world.lastNumber ?? '';
  expect(number, 'la confirmacion deberia traer el numero del documento').toMatch(/^RM-\d+$/);

  await page.goto('/purchases');
  await page.getByRole('link', { name: number, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
});

Then(
  'I should see the received product {string} with its unit cost',
  async ({ page }, description: string) => {
    // Se busca por la DESCRIPCION y no por el SKU: la linea guarda como se llamaba
    // el producto aquel dia, y que ese texto siga ahi es justo lo que esta pantalla
    // tiene que poder demostrar.
    const row = page.getByRole('row').filter({ hasText: description });
    await expect(row).toBeVisible();
    await expect(row).toContainText('1.00');
  },
);

/*
 * Corregir un proveedor.
 *
 * Empieza y acaba en el listado porque un proveedor NO tiene ficha propia: cabe entero
 * en su fila, y una pantalla de detalle que repitiera esas cuatro columnas seria un clic
 * de mas para ver lo que ya se esta viendo.
 */

When('I register a supplier just for this scenario', async ({ page, world }) => {
  world.lastCode = `Distribuidora ${uniqueCode()}`;

  await page.goto('/purchases/suppliers');
  const form = page.getByRole('complementary', { name: /new supplier/i });
  await form.getByLabel(/name/i).fill(world.lastCode);
  await form.getByRole('button', { name: /save/i }).click();

  await expect(page.getByRole('cell', { name: world.lastCode }).first()).toBeVisible();
});

When('I correct its contact person', async ({ page, world }) => {
  world.correctedName = `Contacto ${uniqueCode()}`;

  const row = page.getByRole('row').filter({ hasText: world.lastCode ?? '' });
  await row.getByRole('link', { name: /^edit$|^editar$/i }).click();

  // Wait for the EDIT screen before touching any field. The suppliers list has its own
  // "new supplier" form with the same "Contact person" field, and the Edit link navigates
  // on the client: filling right after the click typed into the list's form, the edit
  // form then saved with the contact still empty, and the scenario failed looking like a
  // persistence bug.
  await page.waitForURL(/\/purchases\/suppliers\/[^/]+\/edit$/);
  const contact = page.getByLabel(/contact/i);
  await contact.fill(world.correctedName);
  await expect(contact).toHaveValue(world.correctedName);

  await page.getByRole('button', { name: /save/i }).click();
  await page.waitForURL(/\/purchases\/suppliers(\?|$)/);
});

Then('the supplier list shows the new contact person', async ({ page, world }) => {
  const row = page.getByRole('row').filter({ hasText: world.lastCode ?? '' });
  await expect(row).toContainText(world.correctedName ?? '');
});
