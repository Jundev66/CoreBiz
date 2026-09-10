import { test, expect, type Page } from '@playwright/test';

/**
 * El sandbox de demostracion, de punta a punta.
 *
 * Solo tiene sentido contra Postgres: en modo memoria no hay nada que clonar y
 * la aplicacion entera ya es la demostracion.
 *
 * Dos escenarios justifican el archivo. Uno es el aislamiento: dos visitantes
 * reciben copias distintas, y lo que uno escribe no aparece en la del otro. El
 * otro es que las credenciales que se entregan SIRVEN de verdad — se sale y se
 * vuelve a entrar con ellas. Los tests de integracion prueban esto a nivel de
 * SQL; aqui pasa por GoTrue, por las cookies y por las politicas RLS.
 */

const POSTGRES = process.env.E2E_DRIVER === 'postgres';

interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Abre la demostracion y devuelve las credenciales que entrega la pantalla. */
async function start(page: Page): Promise<Credentials> {
  await page.goto('/demo');
  await page.getByRole('button', { name: /demo|demostración/i }).click();

  const panel = page.getByRole('status').first();
  await expect(panel).toBeVisible();

  // Se leen de la pantalla y no de la base: lo que hay que comprobar es que la
  // persona recibe algo con lo que puede volver a entrar, no que exista una fila.
  const values = await panel.locator('dd').allTextContents();
  const [email, password] = values.map((v) => v.trim());

  expect(email, 'la pantalla deberia entregar un correo').toMatch(/@corebiz\.demo$/);
  expect(password ?? '', 'la pantalla deberia entregar una contraseña').not.toBe('');

  await page.getByRole('link', { name: /entrar|enter/i }).click();
  await expect(page).toHaveURL(/\/customers$/);

  return { email: email ?? '', password: password ?? '' };
}

test.describe('Demostracion efimera', () => {
  test.skip(!POSTGRES, 'requiere Postgres: correr con E2E_DRIVER=postgres');

  test('no se provisiona por el simple hecho de abrir la pagina', async ({ page }) => {
    await page.goto('/demo');

    // Es la decision que mas protege el presupuesto. Un GET que provisiona lo
    // dispara cualquier rastreador, cualquier previsualizacion de enlace de un
    // chat y cualquier antivirus de correo: publicar el enlace crearia decenas
    // de cuentas y de copias de la base antes de que lo abriese una persona.
    await expect(page.getByRole('button', { name: /demo|demostración/i })).toBeVisible();
    await expect(page.locator('form')).toBeVisible();
  });

  test('entra con credenciales propias y avisa de que es temporal', async ({ page }) => {
    await start(page);

    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toBeVisible();

    // El aviso va DENTRO, en todas las pantallas, y no solo en la puerta.
    // Enterarse de que se borra todo despues de haberlo perdido es la peor forma
    // posible de contarlo.
    const aviso = /se borran|are deleted/i;
    await expect(page.getByText(aviso).first()).toBeVisible();
    await page.goto('/products');
    await expect(page.getByText(aviso).first()).toBeVisible();

    // Y hay sesion de verdad: la barra ofrece salir, no solo crear una cuenta.
    await expect(page.getByRole('button', { name: /cerrar sesión|sign out/i })).toBeVisible();
  });

  test('las credenciales entregadas sirven para volver a entrar', async ({ page }) => {
    const { email, password } = await start(page);

    await page.getByRole('button', { name: /cerrar sesión|sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel(/correo|email/i).fill(email);
    await page.getByLabel(/contraseña|password/i).fill(password);
    await page.getByRole('button', { name: /entrar|sign in/i }).click();

    // Se espera a que la accion termine su redireccion. Navegar antes cancela el
    // POST en vuelo y la cookie de sesion no llega nunca — sin ningun error a la
    // vista, que es lo que lo hace dificil de leer.
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));

    // Vuelve a SU copia, no a la plantilla ni a una nueva.
    await page.goto('/customers');
    await expect(page.getByRole('cell', { name: 'Bodega La Esquina' })).toBeVisible();
  });

  test('volver a /demo con la sesion abierta no ofrece crear otra copia', async ({ page }) => {
    await start(page);

    // Sin esto, recargar la pagina costaria una cuenta y una base de datos
    // enteras — y el limite por hora se lo negaria al mismo visitante que ya
    // esta dentro, que es la peor forma de decir "ya entraste".
    await page.goto('/demo');
    await expect(page.getByRole('button', { name: /demo|demostración/i })).toHaveCount(0);

    await page.getByRole('link', { name: /entrar|enter/i }).click();
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('dos visitantes no ven lo que hace el otro', async ({ browser }) => {
    const visitante = async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await start(page);
      return { context, page };
    };

    const uno = await visitante();
    const otro = await visitante();

    try {
      // El nombre, y no un codigo: el codigo ya no se escribe, lo asigna el
      // sistema. Se hace unico por marca de tiempo para que la comprobacion de
      // aislamiento no dependa de lo que haya dejado otra corrida.
      const code = `Cliente ${Date.now().toString().slice(-6)}`;

      await uno.page.goto('/customers/new');
      await uno.page
        .getByLabel(/name|nombre/i)
        .first()
        .fill(code);
      await uno.page.getByRole('button', { name: /save|guardar/i }).click();

      // Se espera a estar de VUELTA en el listado antes de seguir. Sin esto, el `goto`
      // corre contra la Server Action todavia en vuelo y la lista se pide antes de que
      // exista la fila — un fallo que parece de aislamiento y es de tiempos.
      //
      // Antes se esperaba al aviso dentro del formulario; ya no vive ahi, y ademas se
      // va solo a los seis segundos: la URL es una senal mas firme que algo que caduca.
      await uno.page.waitForURL(/\/customers(\?|$)/);

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
