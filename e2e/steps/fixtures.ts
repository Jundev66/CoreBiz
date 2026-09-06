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
 * El rol y el plan viajan en cookies, lo mismo que en la demo publica.
 *
 * Sembrar el estado por cookie en lugar de navegar por la interfaz hace los escenarios
 * rapidos y estables: preparar el contexto no deberia depender de que los formularios
 * de otro modulo funcionen.
 */
export async function setDemoCookies(
  page: Page,
  values: { role?: string; plan?: string; locale?: string },
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
  if (values.plan) {
    cookies.push({
      name: 'corebiz_demo_plan',
      value: values.plan,
      domain: url.hostname,
      path: '/',
    });
  }
  if (values.locale) {
    cookies.push({ name: 'corebiz_locale', value: values.locale, domain: url.hostname, path: '/' });
  }

  await page.context().addCookies(cookies);
}
