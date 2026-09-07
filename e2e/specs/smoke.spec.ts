import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Recorrido de humo.
 *
 * Comprueba lo que tiene que funcionar SIEMPRE para que el enlace del CV sea util:
 * que la aplicacion carga, que se navega, que es accesible y que no filtra
 * informacion de la plataforma.
 */

test.describe('Recorrido basico', () => {
  test('la portada carga y lleva al modulo de clientes', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'CoreBiz', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /clientes|customers/i }).click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('el listado muestra los datos sembrados con su cuota', async ({ page }) => {
    await page.goto('/customers');

    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toBeVisible();

    // La cuota se expone como progressbar con sus valores ARIA: se puede verificar sin
    // depender de como este redactado el texto, y ademas es accesible.
    //
    // El limite se comprueba exacto porque es una regla del plan; el consumo solo se
    // comprueba coherente, porque los escenarios BDD comparten servidor y pueden haber
    // dado de alta clientes antes. Fijar aqui un numero exacto haria que este test
    // fallase segun el ORDEN de ejecucion, que no es lo que pretende verificar.
    const quota = page.getByRole('progressbar');
    await expect(quota).toHaveAttribute('aria-valuemax', '50');

    const used = Number(await quota.getAttribute('aria-valuenow'));
    expect(used).toBeGreaterThanOrEqual(8);
    expect(used).toBeLessThanOrEqual(50);
  });

  test('el aviso de documento no fiscal esta presente', async ({ page }) => {
    // Es un requisito del producto, no un detalle de estilo: la aplicacion no puede
    // dar a entender que emite comprobantes con valor tributario. El patron cubre las
    // dos redacciones (es: "sin valor fiscal", en: "no fiscal value").
    await page.goto('/customers');
    await expect(page.getByText(/sin valor fiscal|no fiscal value/i)).toBeVisible();
  });
});

test.describe('Internacionalizacion', () => {
  test('la interfaz cambia a ingles con la cookie de idioma', async ({ page, context }) => {
    await context.addCookies([
      { name: 'corebiz_locale', value: 'en', domain: 'localhost', path: '/' },
    ]);

    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
    await expect(page.getByText('Business customer directory')).toBeVisible();
  });
});

test.describe('Accesibilidad', () => {
  for (const path of ['/', '/customers', '/customers/new', '/settings', '/settings/team']) {
    test(`sin violaciones serias en ${path}`, async ({ page }) => {
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );

      // Se informa de QUE regla falla y DONDE: un fallo de accesibilidad sin el
      // selector obliga a reproducirlo a mano para saber que arreglar.
      expect(
        serious,
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`).join('\n'),
      ).toEqual([]);
    });
  }
});

test.describe('Seguridad', () => {
  test('no se anuncia el framework en las cabeceras', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};

    // `poweredByHeader: false` en next.config. Reduce la superficie de reconocimiento:
    // no evita un ataque, pero no hay razon para regalar la version del framework.
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('los datos de un tenant no se cachean en el CDN', async ({ page }) => {
    const response = await page.goto('/customers');
    const cacheControl = response?.headers()['cache-control'] ?? '';

    // Servir datos de una empresa desde cache compartida seria una fuga entre clientes.
    expect(cacheControl).toMatch(/no-store|private|no-cache/);
  });
});
