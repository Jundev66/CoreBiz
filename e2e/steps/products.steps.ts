import { expect, type Page } from '@playwright/test';
import { When, Then, readStock } from './fixtures';

/**
 * Pasos del ajuste de inventario.
 *
 * El ajuste se expresa como "cinco mas de las que dice el sistema" y no como un
 * numero absoluto. En la pantalla se escribe el saldo real —que es lo correcto
 * para quien cuenta un estante— pero el ESCENARIO no puede fijar ese numero: la
 * suite comparte servidor y corre en paralelo, asi que el saldo de partida es lo
 * unico que no se puede dar por sabido.
 */

When(
  'I count {int} more of {string} than the system says, because of {string}',
  async ({ page }, extra: number, sku: string, reason: string) => {
    const counted = (await readStock(page, sku)) + extra;

    await openAdjustForm(page, sku);
    await countedField(page).fill(String(counted));
    await page.getByLabel(/reason|motivo/i).fill(reason);
    await submit(page);

    // Se espera la confirmacion ANTES de seguir. Sin esto, el paso siguiente
    // recarga la pantalla mientras la Server Action sigue en vuelo y lee el
    // saldo anterior — un fallo que parece del ajuste y es de tiempos.
    await expect(page.locator('form').getByRole('status')).toBeVisible();
  },
);

When(
  'I count {int} more of {string} than the system says, without saying why',
  async ({ page }, extra: number, sku: string) => {
    const counted = (await readStock(page, sku)) + extra;

    await openAdjustForm(page, sku);
    await countedField(page).fill(String(counted));

    // Espacios en blanco, no el campo vacio. El `required` del HTML da por bueno
    // un espacio, asi que el formulario SE ENVIA y el "no" tiene que venir del
    // dominio — que es lo que hay que comprobar. Un test que se apoyara en la
    // validacion del navegador no probaria nada: cualquiera invoca la Server
    // Action directamente.
    await page.getByLabel(/reason|motivo/i).fill('   ');
    await submit(page);
  },
);

Then('I should see that the adjustment needs a reason', async ({ page }) => {
  await expect(page.locator('form').getByRole('alert')).toBeVisible();
});

function countedField(page: Page) {
  return page.getByLabel(/how many there actually are|cuántas hay de verdad/i);
}

function submit(page: Page): Promise<void> {
  return page.getByRole('button', { name: /save the adjustment|guardar el ajuste/i }).click();
}

/**
 * Llega al formulario de ajuste, que vive en la FICHA del producto.
 *
 * Estaba en el listado, detras de un parametro en la URL, y se movio aqui porque
 * contar un estante empieza mirando el historico —"¿por que dice ocho si veo
 * cinco?"— y tenerlos en pantallas distintas partia esa tarea en dos.
 */
async function openAdjustForm(page: Page, sku: string): Promise<void> {
  await page.goto('/products');
  const row = page.getByRole('row').filter({ hasText: sku }).first();
  await row.getByRole('link', { name: /view|ver/i }).click();
  await expect(
    page.getByRole('heading', { name: /adjust stock|ajustar inventario/i }),
  ).toBeVisible();
}
