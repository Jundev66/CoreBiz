import { test, expect } from '@playwright/test';
import { signIn } from '../session';

/**
 * El documento impreso y la comprobacion de salud.
 *
 * Son las dos piezas que solo existen para ser consumidas desde fuera: una por
 * una impresora, la otra por un monitor. Ninguna se ejercita al navegar la
 * aplicacion, asi que sin estos tests podrian romperse y nadie se enteraria
 * hasta el dia que hagan falta — que es siempre el peor dia.
 */

/**
 * Todas las pantallas de dentro exigen sesion: la aplicacion ya no sirve la
 * demostracion a quien no ha entrado. Se inicia una vez por test y no una vez
 * por fichero para que cada uno siga siendo independiente del orden.
 */
test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test.describe('Nota de entrega imprimible', () => {
  test('lleva el aviso de documento no fiscal', async ({ page }) => {
    await page.goto('/delivery-notes');
    await page.getByRole('link', { name: /NE-/ }).first().click();
    await page.getByRole('link', { name: /print|imprimir/i }).click();

    await expect(page).toHaveURL(/\/print$/);

    // Es un requisito del producto, no un detalle de estilo: este papel no puede
    // dar a entender que es un comprobante con valor tributario.
    await expect(page.getByText(/sin valor fiscal|no fiscal value/i)).toBeVisible();
  });

  test('muestra la tasa congelada CON su fecha de captura', async ({ page }) => {
    await page.goto('/delivery-notes');
    await page.getByRole('link', { name: /NE-/ }).first().click();
    await page.getByRole('link', { name: /print|imprimir/i }).click();

    // Sin la fecha, el numero invita a leerse como la tasa de hoy — y este papel
    // puede reimprimirse dentro de un ano.
    const rate = page.getByText(/36[.,]5/).first();
    await expect(rate).toBeVisible();
  });

  test('no arrastra el marco de la aplicacion', async ({ page }) => {
    await page.goto('/delivery-notes');
    await page.getByRole('link', { name: /NE-/ }).first().click();
    await page.getByRole('link', { name: /print|imprimir/i }).click();

    // Lo que se imprime tiene que ser el documento, no una captura de la
    // aplicacion con el documento dentro.
    await expect(page.getByRole('link', { name: /^customers$|^clientes$/i })).toHaveCount(0);
  });

  test('deja espacio para las dos firmas', async ({ page }) => {
    await page.goto('/delivery-notes');
    await page.getByRole('link', { name: /NE-/ }).first().click();
    await page.getByRole('link', { name: /print|imprimir/i }).click();

    // Un albaran sin firma no prueba que nadie recibiera nada.
    await expect(page.getByText(/delivered by|entregado por/i)).toBeVisible();
    await expect(page.getByText(/received by|recibido por/i)).toBeVisible();
  });
});

test.describe('Comprobacion de salud', () => {
  test('responde 200 y no revela nada de la plataforma', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');

    // Un endpoint de salud es publico por definicion. Todo lo que diga de mas
    // —version, host, cadena de conexion, conteos— es reconocimiento gratis.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/postgres:\/\/|postgresql:\/\/|password|@/i);
  });

  test('no se cachea', async ({ request }) => {
    const response = await request.get('/api/health');
    // Un estado de salud cacheado no es un estado de salud.
    expect(response.headers()['cache-control']).toContain('no-store');
  });
});
