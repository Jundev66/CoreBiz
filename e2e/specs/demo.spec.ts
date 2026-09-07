import { test, expect } from '@playwright/test';

/**
 * El sandbox de demostracion, de punta a punta.
 *
 * Solo tiene sentido contra Postgres: en modo memoria no hay nada que clonar y
 * la aplicacion entera ya es la demostracion.
 *
 * El escenario que justifica el archivo es el ultimo: dos visitantes distintos
 * reciben copias distintas, y lo que uno escribe no aparece en la del otro. Los
 * tests de integracion prueban el clonado a nivel de SQL; esto lo prueba con
 * navegadores de verdad, cookies de verdad y las politicas RLS por medio.
 */

const POSTGRES = process.env.E2E_DRIVER === 'postgres';

test.describe('Demostracion efimera', () => {
  test.skip(!POSTGRES, 'requiere Postgres: correr con E2E_DRIVER=postgres');

  test('no se provisiona por el simple hecho de abrir la pagina', async ({ page }) => {
    await page.goto('/demo');

    // Es la decision que mas protege el presupuesto. Un GET que provisiona lo
    // dispara cualquier rastreador, cualquier previsualizacion de enlace de un
    // chat y cualquier antivirus de correo: publicar el enlace crearia decenas
    // de copias de la base antes de que lo abriese una persona.
    await expect(page.getByRole('button', { name: /demo|demostración/i })).toBeVisible();
    await expect(page.locator('form')).toBeVisible();
  });

  test('entra a una copia propia y la reutiliza al volver', async ({ page }) => {
    await page.goto('/demo');
    await page.getByRole('button', { name: /demo|demostración/i }).click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toBeVisible();

    // Volver a /demo con la cookie puesta NO crea otra copia: entra a la que ya
    // tiene. Sin esto, recargar la pagina costaria una base de datos entera.
    await page.goto('/demo');
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('dos visitantes no ven lo que hace el otro', async ({ browser }) => {
    const visitante = async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('/demo');
      await page.getByRole('button', { name: /demo|demostración/i }).click();
      await expect(page).toHaveURL(/\/customers$/);
      return { context, page };
    };

    const uno = await visitante();
    const otro = await visitante();

    try {
      const code = `CLI-${Date.now().toString().slice(-6)}`;

      await uno.page.goto('/customers/new');
      await uno.page.getByLabel(/code|código/i).fill(code);
      await uno.page
        .getByLabel(/name|nombre/i)
        .first()
        .fill('Cliente del visitante uno');
      await uno.page.getByRole('button', { name: /save|guardar/i }).click();

      // Se espera la confirmacion ANTES de navegar. Sin esto, el `goto` corre
      // contra la Server Action todavia en vuelo y el listado se pide antes de
      // que exista la fila — un fallo que parece de aislamiento y es de tiempos.
      await expect(uno.page.locator('form').getByRole('status')).toBeVisible();

      await uno.page.goto('/customers');
      await expect(uno.page.getByRole('cell', { name: code })).toBeVisible();

      // ESTA es la aserción que importa. Si apareciera aqui, las demostraciones
      // no estarian aisladas — y se verian exactamente igual de bien que ahora.
      await otro.page.goto('/customers');
      await expect(otro.page.getByRole('cell', { name: code })).toHaveCount(0);
    } finally {
      await uno.context.close();
      await otro.context.close();
    }
  });
});
