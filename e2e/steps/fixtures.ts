import { test as base, createBdd } from 'playwright-bdd';
import type { Page } from '@playwright/test';

/**
 * Fixtures compartidas por los escenarios BDD.
 *
 * Se usa `playwright-bdd` y no `@cucumber/cucumber` porque mantiene el runner nativo de
 * Playwright: se conservan los fixtures, el paralelismo, las trazas y el reporte HTML
 * sin tener que cablearlos a mano. La sintaxis Gherkin es la misma que usaria Behat.
 */

export interface CustomerWorld {
  /** Ultimo codigo escrito en el formulario. Lo comparten pasos consecutivos. */
  lastCode?: string;
  /** Saldo de inventario leido antes de una operacion, para comprobar la variacion. */
  stockBefore?: number;
  /**
   * Numero del ultimo documento emitido.
   *
   * Hace falta para volver a abrirlo: los escenarios corren en paralelo, asi que
   * "el primero de la lista" puede ser el documento de otro escenario. Lo fue.
   */
  lastNumber?: string;
}

export const test = base.extend<{ world: CustomerWorld }>({
  // Un mundo nuevo por escenario: los pasos comparten estado entre si, pero nunca
  // entre escenarios distintos. Compartirlo los volveria dependientes del orden.
  // eslint-disable-next-line no-empty-pattern -- firma de fixture que exige Playwright
  world: async ({}, use) => {
    await use({});
  },
});

export const { Given, When, Then } = createBdd(test);

/**
 * El rol viaja en cookie, lo mismo que en la demo publica.
 *
 * Sembrar el estado por cookie en lugar de navegar por la interfaz hace los escenarios
 * rapidos y estables: preparar el contexto no deberia depender de que los formularios
 * de otro modulo funcionen.
 */
export async function setDemoCookies(
  page: Page,
  values: { role?: string; locale?: string },
): Promise<void> {
  const url = new URL(page.url() === 'about:blank' ? 'http://localhost:3210' : page.url());
  const cookies = [];

  if (values.role) {
    cookies.push({
      name: 'corebiz_demo_role',
      value: values.role,
      domain: url.hostname,
      path: '/',
    });
  }
  if (values.locale) {
    cookies.push({ name: 'corebiz_locale', value: values.locale, domain: url.hostname, path: '/' });
  }

  await page.context().addCookies(cookies);
}

// El inicio de sesion vive en `../session`: lo comparten estos pasos y los specs.
export { signIn } from '../session';

/**
 * Lee el saldo de inventario de un SKU desde la pantalla de productos.
 *
 * Se apunta a la celda por su POSICION en la fila —sku, nombre, precio, saldo— y
 * no a "la ultima", que es lo que hacia antes. Dejo de funcionar el dia que la
 * tabla gano una columna de acciones al final: el paso empezo a leer el texto de
 * un enlace y a devolver cero, y el fallo aparecia en los escenarios de ventas,
 * que no tenian nada que ver con el cambio.
 */
export async function readStock(page: Page, sku: string): Promise<number> {
  await page.goto('/products');
  const cells = await page
    .getByRole('row')
    .filter({ hasText: sku })
    .locator('td')
    .allTextContents();
  const stock = cells[3] ?? '';
  return Number(stock.replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}
