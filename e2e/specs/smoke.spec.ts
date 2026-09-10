import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from '../session';

/**
 * Recorrido de humo.
 *
 * Comprueba lo que tiene que funcionar SIEMPRE para que el enlace del CV sea util:
 * que la aplicacion carga, que se navega, que es accesible y que no filtra
 * informacion de la plataforma.
 */

/**
 * Todas las pantallas de dentro exigen sesion: la aplicacion ya no sirve la
 * demostracion a quien no ha entrado. Se inicia una vez por test y no una vez
 * por fichero para que cada uno siga siendo independiente del orden.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe('Recorrido basico', () => {
  test('la raiz es el panel de inicio y lleva al modulo de clientes', async ({ page }) => {
    await page.goto('/');

    // Con sesion, la raiz ya no es una portada con enlaces: es el panel. Antes el
    // encabezado era el nombre del producto, que en una pantalla de trabajo no dice
    // nada — el h1 tiene que nombrar DONDE estas.
    await expect(page.getByRole('heading', { name: /inicio|home/i, level: 1 })).toBeVisible();

    await page
      .getByRole('link', { name: /clientes|customers/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('el listado muestra los datos sembrados', async ({ page }) => {
    await page.goto('/customers');

    // Se comprueban dos filas y no una: una sola podria colarse desde un mensaje
    // suelto, mientras que dos clientes concretos del sembrador solo pueden venir de
    // la consulta que alimenta la tabla.
    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Ferreteria El Tornillo' })).toBeVisible();
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
    await expect(page.getByText('Registered customers')).toBeVisible();
  });
});

test.describe('Accesibilidad', () => {
  for (const path of [
    '/',
    '/customers',
    '/customers/new',
    '/settings',
    '/settings/team',
    '/purchases',
    // Los modulos en desarrollo tambien se navegan y tambien se leen con un lector
    // de pantalla: una pantalla que solo explica algo no esta exenta.
    '/login',
  ]) {
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
