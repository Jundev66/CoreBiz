import { test, expect, type Page } from '@playwright/test';

/**
 * Autenticacion real, contra Supabase.
 *
 * Solo tiene sentido con `E2E_DRIVER=postgres`: en modo memoria no hay sesiones
 * que crear ni empresas que aislar, y montar dobles de Supabase para simularlo
 * comprobaria el doble, no el sistema.
 *
 * El escenario que justifica el archivo entero es el ultimo: una cuenta recien
 * creada NO ve los datos de la empresa de demostracion. Los tests de integracion
 * ya prueban eso a nivel de SQL; este lo prueba de punta a punta, con la sesion
 * de verdad, las politicas de verdad y el navegador de verdad en medio.
 */

const POSTGRES = process.env.E2E_DRIVER === 'postgres';

test.describe('Cuentas y sesion', () => {
  test.skip(!POSTGRES, 'requiere Supabase: correr con E2E_DRIVER=postgres');

  /** Cada corrida usa un correo propio: las cuentas quedan en la base. */
  const uniqueEmail = () =>
    `prueba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@corebiz.test`;

  async function signIn(page: Page, email: string, password: string): Promise<void> {
    await page.goto('/login');
    await page.getByLabel(/correo|email/i).fill(email);
    await page.getByLabel(/contraseña|password/i).fill(password);
    await page.getByRole('button', { name: /entrar|sign in/i }).click();
  }

  test('la cuenta sembrada entra y sale', async ({ page }) => {
    await signIn(page, 'demo@corebiz.local', 'corebiz-demo');

    await expect(page).toHaveURL(/\/$/);
    await page.goto('/customers');

    // Con sesion, la barra ofrece salir. Sin ella ofrece crear cuenta: son dos
    // estados distintos del mismo sitio, y confundirlos es el fallo tipico.
    const signOut = page.getByRole('button', { name: /cerrar sesión|sign out/i });
    await expect(signOut).toBeVisible();

    await signOut.click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('una contraseña equivocada no dice si el correo existe', async ({ page }) => {
    await signIn(page, 'demo@corebiz.local', 'esta-no-es-la-clave');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();

    // El mismo mensaje para "no existe" y para "no es esa": distinguirlos
    // convertiria el formulario en un comprobador de cuentas registradas.
    const conocido = await alert.textContent();
    await signIn(page, 'no-existe-en-absoluto@corebiz.test', 'esta-no-es-la-clave');
    await expect(page.getByRole('alert')).toHaveText(conocido ?? '');
  });

  test('una cuenta nueva empieza vacia y no ve los datos de la demostracion', async ({ page }) => {
    const email = uniqueEmail();

    await page.goto('/signup');
    await page.getByLabel(/negocio|business/i).fill('Abastos El Trigal');
    await page.getByLabel(/correo|email/i).fill(email);
    await page.getByLabel(/contraseña|password/i).fill('una-clave-larga-y-tranquila');
    await page.getByRole('button', { name: /crear|create/i }).click();

    // Registrarse deja en el ALTA DE EMPRESA, no dentro. Es el unico sitio donde nace
    // una empresa, y donde se le pone la tasa de cambio sin la cual no podria emitir.
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel(/tasa|exchange/i).fill('36.50');
    await page.getByRole('button', { name: /empezar|get started/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/customers');

    // ESTA es la aserción que importa. "Bodega La Esquina" es un cliente del
    // tenant de demostracion. Si apareciera aqui, el aislamiento multi-tenant no
    // existiria — y se veria exactamente igual de bien que ahora.
    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: 'Ferreteria El Tornillo' })).toHaveCount(0);

    // Y arranca vacia de verdad: ni una sola fila en la tabla de clientes.
    await expect(page.getByRole('row')).toHaveCount(0);
  });

  test('la pantalla de recuperacion no revela si la direccion existe', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/correo|email/i).fill('nadie-tiene-este-correo@corebiz.test');
    await page.getByRole('button', { name: /enviar|send/i }).click();

    // Responde "enviado" siempre. Es menos util para quien se equivoco al
    // escribir y mucho menos util para quien esta buscando cuentas.
    await expect(page.getByRole('status')).toBeVisible();
  });
});
